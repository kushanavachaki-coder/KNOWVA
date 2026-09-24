import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { AsyncLocalStorage } from "async_hooks";

// Global error handlers to prevent silent Cloud Run crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
});

// AsyncLocalStorage to maintain user identity token per request context safely
const authContextStore = new AsyncLocalStorage<{ token: string; userId: string }>();

// Read Firebase config
let firebaseConfig: any = {};
try {
  let configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (!fs.existsSync(configPath)) {
    configPath = path.join(__dirname, "firebase-applet-config.json");
  }
  if (fs.existsSync(configPath)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.error("Failed to parse firebase-applet-config.json:", e);
    }
  }
} catch (configErr) {
  console.error("Failed to read firebase config:", configErr);
}

if (!firebaseConfig.projectId) {
  firebaseConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "ai-studio-knowva-fallback",
    firestoreDatabaseId: "ai-studio-knowva-da295151-ab5e-46d4-908c-7aea652a9874"
  };
}

// Custom REST API Firestore engine to communicate securely on behalf of each user
function toFirestoreValue(val: any): any {
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (val === null) return { nullValue: null };
  if (typeof val === "object") {
    const fields: any = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(fVal: any): any {
  if (!fVal) return null;
  if ("stringValue" in fVal) return fVal.stringValue;
  if ("booleanValue" in fVal) return fVal.booleanValue;
  if ("integerValue" in fVal) return parseInt(fVal.integerValue, 10);
  if ("doubleValue" in fVal) return fVal.doubleValue;
  if ("arrayValue" in fVal) {
    return (fVal.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in fVal) {
    const obj: any = {};
    const fields = fVal.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  if ("nullValue" in fVal) return null;
  return null;
}

function buildWhereClause(filters: Array<{ field: string; op: string; value: any }>) {
  if (filters.length === 0) return undefined;
  
  const mapOp = (op: string) => {
    if (op === "==" || op === "EQUAL") return "EQUAL";
    if (op === ">") return "GREATER_THAN";
    if (op === ">=") return "GREATER_THAN_OR_EQUAL";
    if (op === "<") return "LESS_THAN";
    if (op === "<=") return "LESS_THAN_OR_EQUAL";
    return op;
  };

  const buildFilter = (f: { field: string; op: string; value: any }) => {
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: mapOp(f.op),
        value: toFirestoreValue(f.value)
      }
    };
  };

  if (filters.length === 1) {
    return buildFilter(filters[0]);
  }

  return {
    compositeFilter: {
      op: "AND",
      filters: filters.map(buildFilter)
    }
  };
}

class RestDocumentSnapshot {
  constructor(public id: string, private _data: any) {}
  data() {
    return this._data;
  }
}

class RestQuerySnapshot {
  constructor(public docs: RestDocumentSnapshot[]) {}
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(callback: (doc: RestDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

const FieldValue = {
  serverTimestamp() {
    return new Date().toISOString();
  }
};

class RestCollectionReference {
  constructor(private collectionName: string, private token: string) {}

  where(field: string, op: string, value: any) {
    return new RestQueryReference(this.collectionName, this.token, [{ field, op, value }]);
  }

  async add(data: any) {
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${this.collectionName}`;
    
    const fields: any = {};
    for (const [k, v] of Object.entries(data)) {
      fields[k] = toFirestoreValue(v);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`RestCollectionReference.add failed: ${res.status} ${errText}`);
      throw new Error(`Firestore REST Write failed: ${res.status} ${errText}`);
    }

    const responseData = await res.json();
    const id = responseData.name.split("/").pop();
    return { id };
  }
}

class RestQueryReference {
  constructor(
    private collectionName: string,
    private token: string,
    private filters: Array<{ field: string; op: string; value: any }>
  ) {}

  where(field: string, op: string, value: any) {
    return new RestQueryReference(this.collectionName, this.token, [...this.filters, { field, op, value }]);
  }

  async get() {
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`;

    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: this.collectionName }],
        where: buildWhereClause(this.filters)
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`RestQueryReference.get failed: ${res.status} ${errText}`);
      throw new Error(`Firestore REST Query failed: ${res.status} ${errText}`);
    }

    const results = await res.json();
    if (!Array.isArray(results)) {
      return new RestQuerySnapshot([]);
    }

    const docs = results
      .filter(r => r.document)
      .map(r => {
        const id = r.document.name.split("/").pop();
        const data: any = {};
        const fields = r.document.fields || {};
        for (const [k, v] of Object.entries(fields)) {
          data[k] = fromFirestoreValue(v);
        }
        return new RestDocumentSnapshot(id, data);
      });

    return new RestQuerySnapshot(docs);
  }
}

// Global db definition replacing the firebase-admin db instance
const db = {
  collection(collectionName: string) {
    const store = authContextStore.getStore();
    if (!store?.token) {
      throw new Error("No active authenticated context found for Firestore access.");
    }
    return new RestCollectionReference(collectionName, store.token);
  }
};

let authAdmin: any = null;
try {
  let app: any;
  const adminAny = admin as any;
  if (adminAny.apps.length > 0) {
    app = adminAny.apps[0];
    if (process.env.NODE_ENV !== "production") {
      console.log("[Knowva] Reusing existing Firebase Admin App.");
    }
  } else {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      // Update firebaseConfig.projectId to match service account project id
      if (serviceAccount.project_id) {
        firebaseConfig.projectId = serviceAccount.project_id;
      }
      
      app = adminAny.initializeApp({
        credential: adminAny.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[Knowva] Firebase Admin App initialized with service account from env.");
      }
    } else {
      app = adminAny.initializeApp({
        projectId: firebaseConfig.projectId
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[Knowva] Firebase Admin App initialized for Auth verification.");
      }
    }
  }
  authAdmin = getAuth(app);
} catch (fbErr: any) {
  // Prevent printing credentials or private keys, keep errors clean and safe
  console.error("[Knowva] Warning: Firebase Admin Auth initialization encountered an issue:", fbErr?.message || fbErr);
}

// Initialize Gemini SDK (lazily initialized inside handlers or at start)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Warning: GEMINI_API_KEY is not defined in environment variables!");
}
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

// Cosine similarity computation
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Paragraph/Sentence-aware overlapping text chunking
function chunkText(text: string, maxChunkSize = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  let startIndex = 0;
  
  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex >= text.length) {
      chunks.push(text.substring(startIndex).trim());
      break;
    }
    
    // Look for paragraph or sentence breaks
    let splitIndex = -1;
    const searchArea = text.substring(Math.max(0, endIndex - 120), Math.min(text.length, endIndex + 50));
    const searchStartInText = Math.max(0, endIndex - 120);
    
    const paragraphBreak = searchArea.lastIndexOf("\n\n");
    if (paragraphBreak !== -1) {
      splitIndex = searchStartInText + paragraphBreak + 2;
    } else {
      const sentenceBreak = Math.max(
        searchArea.lastIndexOf(". "),
        searchArea.lastIndexOf("? "),
        searchArea.lastIndexOf("! ")
      );
      if (sentenceBreak !== -1) {
        splitIndex = searchStartInText + sentenceBreak + 2;
      }
    }
    
    // Fallback to space
    if (splitIndex === -1) {
      const spaceBreak = searchArea.lastIndexOf(" ");
      if (spaceBreak !== -1) {
        splitIndex = searchStartInText + spaceBreak + 1;
      } else {
        splitIndex = endIndex;
      }
    }
    
    // Prevent infinite loop
    if (splitIndex <= startIndex) {
      splitIndex = endIndex;
    }
    
    chunks.push(text.substring(startIndex, splitIndex).trim());
    startIndex = splitIndex - overlap;
    if (startIndex < 0) startIndex = splitIndex;
  }
  
  return chunks.filter(c => c.length > 30);
}

const app = express();

// Set limits higher to support large paste payloads and documents
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Authentication middleware to verify Firebase ID tokens securely
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing Authorization header" });
    }

    const token = authHeader.substring(7);
    try {
      const decodedToken = await authAdmin.verifyIdToken(token);
      const userId = decodedToken.uid;
      (req as any).user = {
        uid: userId,
        email: decodedToken.email
      };
      authContextStore.run({ token, userId }, () => {
        next();
      });
    } catch (err: any) {
      console.error("Firebase ID token verification failed:", err);
      return res.status(401).json({ error: `Unauthorized: Invalid token: ${err.message}` });
    }
  };

  // --- API ENDPOINTS ---

  // 1. Process Uploaded/Pasted Document
  app.post("/api/documents/process", requireAuth, async (req, res) => {
    try {
      const { title, type, content, pages } = req.body;
      const userId = (req as any).user.uid;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (type === "pdf" && (!pages || !Array.isArray(pages))) {
        return res.status(400).json({ error: "Pages array is required for PDF documents" });
      }

      if (type === "text" && !content) {
        return res.status(400).json({ error: "Content is required for plain text documents" });
      }

      let docFullText = "";
      const rawChunks: { text: string; pageNumber?: number }[] = [];

      if (type === "pdf") {
        for (const p of pages) {
          docFullText += p.text + "\n";
          // Chunk each page individually to preserve page mapping precision
          const pageChunks = chunkText(p.text, 800, 150);
          for (const chunk of pageChunks) {
            rawChunks.push({
              text: chunk,
              pageNumber: p.pageNumber
            });
          }
        }
      } else {
        docFullText = content;
        const textChunks = chunkText(content, 800, 150);
        for (const chunk of textChunks) {
          rawChunks.push({
            text: chunk,
            pageNumber: 1
          });
        }
      }

      if (rawChunks.length === 0) {
        return res.status(400).json({ error: "No readable content extracted from study material" });
      }

      // 1. Save Document record to Firestore
      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG INGEST DIAGNOSTIC 1/5] PDF / Document Received`);
        console.log(`[RAG INGEST DIAGNOSTIC 2/5] PDF Text Extracted successfully. Character count: ${docFullText.length}`);
        console.log(`[RAG INGEST DIAGNOSTIC 3/5] Chunking completed. Total chunks created: ${rawChunks.length}`);
      }

      const docRef = await db.collection("documents").add({
        userId,
        title,
        type,
        content: docFullText,
        pageCount: type === "pdf" ? pages.length : 1,
        chunkCount: rawChunks.length,
        createdAt: new Date().toISOString()
      });

      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG INGEST DIAGNOSTIC 5/5] Document master metadata written to Firestore collection "documents". ID: ${docRef.id}`);
      }

      // 2. Generate embeddings for each chunk and save to Firestore
      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG INGEST DIAGNOSTIC 4/5] Initiating Gemini Embeddings. Model: "gemini-embedding-2"`);
      }
      const processedChunks: any[] = [];
      const batchSize = 10;
      
      for (let i = 0; i < rawChunks.length; i += batchSize) {
        const batch = rawChunks.slice(i, i + batchSize);
        const embedPromises = batch.map(async (rc) => {
          try {
            const embedRes: any = await ai.models.embedContent({
              model: "gemini-embedding-2",
              contents: rc.text
            });
            const values = embedRes.embedding?.values || embedRes.embeddings?.[0]?.values || embedRes.embeddings?.values;
            if (values) {
              return {
                text: rc.text,
                pageNumber: rc.pageNumber || 1,
                embedding: values
              };
            }
          } catch (e: any) {
            console.error("[RAG INGEST ERROR] Chunk embedding generation failed: ", e.message || e);
          }
          return null;
        });

        const results = await Promise.all(embedPromises);
        for (const res of results) {
          if (res) {
            processedChunks.push(res);
          }
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG INGEST DIAGNOSTIC] Successfully generated embeddings for ${processedChunks.length}/${rawChunks.length} chunks.`);
      }

      if (processedChunks.length === 0) {
        return res.status(500).json({ 
          error: "Failed to generate embeddings for document content",
          errorStage: "EMBEDDING_FAILED"
        });
      }

      // Write chunks to chunks collection
      const chunkPromises = processedChunks.map(async (pc, index) => {
        return db.collection("chunks").add({
          documentId: docRef.id,
          documentTitle: title,
          userId,
          text: pc.text,
          pageNumber: pc.pageNumber,
          embedding: pc.embedding,
          indexOrder: index,
          createdAt: new Date().toISOString()
        });
      });

      await Promise.all(chunkPromises);
      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG INGEST DIAGNOSTIC] Successfully stored ${chunkPromises.length} chunk documents in Firestore collection "chunks".`);
      }

      // Log study activity
      await db.collection("activity").add({
        userId,
        type: "upload",
        description: `Uploaded and indexed "${title}"`,
        timestamp: new Date().toISOString()
      });

      return res.json({
        success: true,
        diagnostics: {
          pdfReceived: true,
          textExtracted: true,
          charCount: docFullText.length,
          chunksCreated: true,
          chunkCount: rawChunks.length,
          embeddingsGenerated: true,
          embeddingCount: processedChunks.length,
          firestoreStorage: true,
          storageCount: processedChunks.length
        },
        document: {
          id: docRef.id,
          userId,
          name: title,
          type,
          content: docFullText,
          pageCount: type === "pdf" ? pages.length : 1,
          uploadedAt: new Date()
        }
      });
    } catch (error: any) {
      console.error("Error processing document: ", error);
      return res.status(500).json({ error: error.message || "Document processing failed" });
    }
  });

  // Reusable, bounded retry mechanism for transient Gemini failures (429, 500, 502, 503, network timeouts). Max 3 retries, exponential backoff capped at 8s.
  async function generateContentWithRetry(params: any, maxRetries = 3, initialDelayMs = 2000) {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await ai.models.generateContent(params);
      } catch (err: any) {
        lastErr = err;
        const errMsg = (err?.message || String(err) || "").toLowerCase();
        const status = err?.status || err?.code || err?.statusCode;

        // Do NOT retry permanent errors (400, 401, 403, 404, invalid argument, unauthorized, etc.)
        const isPermanent = 
          status === 400 || status === 401 || status === 403 || status === 404 ||
          errMsg.includes("400") || 
          errMsg.includes("401") || 
          errMsg.includes("403") || 
          errMsg.includes("404") || 
          errMsg.includes("invalid_argument") || 
          errMsg.includes("permission_denied") || 
          errMsg.includes("unauthorized") || 
          errMsg.includes("not found") ||
          errMsg.includes("no longer available");

        if (isPermanent) {
          throw err;
        }

        // Check for Quota / Rate Limit (429) or Transient server errors (500, 502, 503, network timeouts)
        const isQuotaExceeded = 
          status === 429 || 
          errMsg.includes("429") || 
          errMsg.includes("resource_exhausted") || 
          errMsg.includes("quota") || 
          errMsg.includes("rate limit") || 
          errMsg.includes("free_tier_requests");

        const isTransient = 
          status === 500 || status === 502 || status === 503 ||
          errMsg.includes("500") || 
          errMsg.includes("502") || 
          errMsg.includes("503") || 
          errMsg.includes("unavailable") || 
          errMsg.includes("high demand") || 
          errMsg.includes("overloaded") || 
          errMsg.includes("internal") || 
          errMsg.includes("bad gateway") || 
          errMsg.includes("econnreset") || 
          errMsg.includes("etimedout") || 
          errMsg.includes("fetch failed") || 
          errMsg.includes("timeout") ||
          errMsg.includes("network");

        if ((isQuotaExceeded || isTransient) && attempt < maxRetries) {
          // Exponential backoff: retry 1 (~2s), retry 2 (~4s), retry 3 (~8s), capped at 8s
          const calculatedDelay = initialDelayMs * Math.pow(2, attempt);
          const delay = Math.min(calculatedDelay, 8000);

          console.warn(`[GEMINI RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw err;
      }
    }
    throw lastErr;
  }

  // Helper for more robust JSON extraction
  function robustParseJSON(text: string) {
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    // Try to find the first { and last }
    const startIndex = cleanText.indexOf('{');
    const endIndex = cleanText.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
       throw new Error("No JSON object found in response");
    }
    
    const jsonStr = cleanText.substring(startIndex, endIndex + 1);
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        // Fallback: fix common JSON errors
        const fixedText = jsonStr.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(fixedText);
    }
  }

  // 2. Chat Query & Retrieval (RAG)
  app.post("/api/chat/ask", requireAuth, async (req, res) => {
    try {
      const { question, history = [] } = req.body;
      const userId = (req as any).user.uid;

      if (!question || question.trim() === "") {
        return res.status(400).json({ error: "Question is required", errorStage: "INVALID_INPUT" });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`\n[RAG SEARCH START] Processing search`);
      }

      // A. Embed the incoming question
      let questionEmbedding: number[] = [];
      try {
        const qEmbedRes: any = await ai.models.embedContent({
          model: "gemini-embedding-2",
          contents: question
        });
        questionEmbedding = qEmbedRes.embedding?.values || qEmbedRes.embeddings?.[0]?.values || qEmbedRes.embeddings?.values || [];
      } catch (err: any) {
        console.error("[RAG SEARCH ERROR Stage: QUESTION_EMBEDDING_FAILED] ", err);
        return res.status(500).json({ 
          error: "Failed to generate embedding for your question. Please verify your Gemini API Key.",
          errorStage: "QUESTION_EMBEDDING_FAILED"
        });
      }

      if (questionEmbedding.length === 0) {
        return res.status(500).json({ 
          error: "API returned an empty embedding vector for the question.",
          errorStage: "QUESTION_EMBEDDING_EMPTY"
        });
      }

      // B. Retrieve ALL chunks for this user's documents from Firestore
      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG SEARCH STEP 5] Fetching chunks from Firestore...`);
      }
      let chunksSnap;
      try {
        chunksSnap = await db.collection("chunks").where("userId", "==", userId).get();
      } catch (err: any) {
        console.error("[RAG SEARCH ERROR Stage: CHUNKS_DB_QUERY_FAILED] ", err);
        return res.status(500).json({ 
          error: "Failed to fetch study chunks from Firestore. Please check database permissions or connection.",
          errorStage: "CHUNKS_DB_QUERY_FAILED"
        });
      }

      const allChunks: any[] = [];
      chunksSnap.forEach((doc: any) => {
        const data = doc.data();
        if (data.embedding && Array.isArray(data.embedding)) {
          allChunks.push({
            id: doc.id,
            documentId: data.documentId,
            documentTitle: data.documentTitle,
            text: data.text,
            pageNumber: data.pageNumber,
            embedding: data.embedding
          });
        }
      });

      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG SEARCH STEP 6] Retrieved ${allChunks.length} chunks from database. Calculating similarity...`);
      }

      // C. Rank chunks by Cosine Similarity + Simple Keyword Fallback match
      const rankedChunks = allChunks.map((chunk) => {
        const similarity = cosineSimilarity(questionEmbedding, chunk.embedding);
        
        // Simple word-matching fallback boost
        const qWords = question.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2);
        let matchCount = 0;
        qWords.forEach((word: string) => {
          if (chunk.text.toLowerCase().includes(word)) {
            matchCount++;
          }
        });
        const keywordScore = qWords.length > 0 ? matchCount / qWords.length : 0;

        // Combined Score: weights cosine vector similarity + keyword text-matching relevance
        const combinedScore = similarity + (keywordScore * 0.45);

        return {
          ...chunk,
          similarity: combinedScore,
          cosineScore: similarity,
          keywordScore: keywordScore
        };
      }).filter(c => c.similarity > 0.22); // More inclusive threshold with combined booster

      // Sort by combined score descending
      rankedChunks.sort((a, b) => b.similarity - a.similarity);

      // Select top 3 chunks
      const topChunks = rankedChunks.slice(0, 3);

      // Log matching scores and Previews
      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG SEARCH RETRIEVAL PREVIEW] Found ${topChunks.length} highly matching chunks.`);
      }

      // Prepare context block (truncated to control token usage)
      let context = "";
      const sources: any[] = [];

      if (topChunks.length > 0) {
        context = "RETRIEVED SYLLABUS/DOCUMENT CONTENT:\n";
        topChunks.forEach((chunk, index) => {
          const truncatedText = chunk.text.length > 450 ? chunk.text.substring(0, 450) + "..." : chunk.text;
          context += `[Source ${index + 1}]: Document: "${chunk.documentTitle}" (Page ${chunk.pageNumber})\nContent: ${truncatedText}\n\n`;
          sources.push({
            title: chunk.documentTitle,
            page: chunk.pageNumber,
            excerpt: chunk.text.length > 120 ? chunk.text.substring(0, 120) + "..." : chunk.text
          });
        });
      }

      // D. Build Chat/System prompt with retrieved context
      const hasSourcedContext = topChunks.length > 0;
      const systemInstruction = `You are Knowva, an elite, personalized AI study companion and academic mentor.
Your goal is to help students master their course materials and study syllabus with clarity.

Rules for answering:
1. Prioritize answering based on the provided "RETRIEVED SYLLABUS/DOCUMENT CONTENT".
2. If the retrieved content contains the answer, use it, explain clearly and student-friendly, and make sure we can attribute it.
3. If the retrieved content does NOT fully answer the question, but general academic knowledge does:
   - Begin your answer by clearly saying: "The uploaded material does not fully cover this, but here is the general academic explanation:"
   - Make sure this notification is honest but subtle.
   - Provide the explanation under a visually distinct, clearly labeled section:
     ### Extra info
4. Highlight important terms using bold formatting.
5. Use bullet points and clear, easy-to-read formatting.
6. Provide helpful structural explanations and practical examples when relevant to the materials.
7. Keep answers structured, highly educational, and geared towards mastering the topic.`;

      // Build message payload for generateContent
      const messagesPayload: any[] = [];
      
      const currentPromptText = hasSourcedContext 
        ? `Retrieved contextual materials:\n${context}\n\nUser Question: ${question}`
        : `User Question: ${question}`;

      // Set up conversation history
      history.forEach((m: any) => {
        messagesPayload.push({
          role: m.sender === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        });
      });

      // Add current request
      messagesPayload.push({
        role: "user",
        parts: [{ text: currentPromptText }]
      });

      // E. Generate answer with Gemini with multi-model fallback and retry
      const askModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
      let generatedText = "";
      let lastAskErr: any = null;

      for (const mName of askModels) {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log(`[RAG SEARCH STEP 7] Submitting grounded payload to model: "${mName}"...`);
          }
          const response = await generateContentWithRetry({
            model: mName,
            contents: messagesPayload,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.15
            }
          });
          generatedText = response.text || "";
          if (generatedText) break;
        } catch (err: any) {
          lastAskErr = err;
          console.warn(`[RAG SEARCH WARNING] Model ${mName} failed:`, err?.message || err);
        }
      }

      if (!generatedText) {
        console.error("[RAG SEARCH ERROR Stage: GEMINI_QA_FAILED] All models failed", lastAskErr);
        return res.status(503).json({ 
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI service is temporarily busy. Please try again.",
          errorStage: "GEMINI_QA_FAILED"
        });
      }

      // Log study activity (OPTIONAL secondary write - failure must NOT break successful answer)
      try {
        await db.collection("activity").add({
          userId,
          type: "ask",
          description: `Asked question: "${question.substring(0, 50)}..."`,
          timestamp: new Date().toISOString()
        });
      } catch (actErr: any) {
        console.warn("[RAG SEARCH WARNING] Optional activity log write to Firestore failed (non-blocking):", actErr?.message || actErr);
      }

      const isExtraInfo = generatedText.includes("### Extra info") || !hasSourcedContext;
      const groundedStatus = hasSourcedContext 
        ? (isExtraInfo ? "fallback_knowledge" : "study_material") 
        : "fallback_knowledge";

      if (process.env.NODE_ENV !== "production") {
        console.log(`[RAG SEARCH COMPLETED] Grounding outcome: "${groundedStatus}" (isExtraInfo: ${isExtraInfo})`);
      }

      return res.json({
        answer: generatedText,
        sources: hasSourcedContext ? sources : [],
        isExtraInfo,
        diagnostics: {
          retrieval: true,
          chunksRetrievedCount: topChunks.length,
          previews: topChunks.map(c => `[Combined Score: ${c.similarity.toFixed(2)}] (p. ${c.pageNumber}): ${c.text.substring(0, 160)}...`),
          groundedStatus,
          lastQuestion: question
        }
      });

    } catch (error: any) {
      console.error("[RAG SEARCH FATAL EXCEPTION] ", error);
      return res.status(500).json({ 
        error: error.message || "Failed to process question",
        errorStage: "FATAL_PIPELINE_EXCEPTION"
      });
    }
  });

  // 3. Generate Personalized Study Note (based on question + answer + context)
  app.post("/api/notes/generate", requireAuth, async (req, res) => {
    try {
      const { question, answer, sources = [] } = req.body;
      const userId = (req as any).user.uid;

      if (!question || !answer) {
        return res.status(400).json({ error: "Question and Answer are required to compile a note" });
      }

      const prompt = `You are a professional study content summarizer. Create a highly detailed, structured study note for a student's personal notes library based strictly on their ask-and-answer interaction and source materials.

      User Question: ${question}
      AI Answer: ${answer}
      Sources Used: ${JSON.stringify(sources)}

      Summarize the actual generated answer and study context accurately. If the answer contains information marked as Extra info, include it properly without pretending general knowledge came from uploaded study material.`;

      let noteContent = "";
      const noteModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
      let lastNoteErr: any = null;
      let successfulModel = "";

      for (const mName of noteModels) {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log(`[STUDY NOTE DIAGNOSTIC] Model attempted: "${mName}"`);
          }
          const response = await generateContentWithRetry({
            model: mName,
            contents: prompt,
            config: {
              temperature: 0.3,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Short descriptive topic title based on question" },
                  summary: { type: Type.STRING, description: "A concise 1-2 sentence high-yield summary of the topic" },
                  keyConcepts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of core key concepts"
                  },
                  definitions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        term: { type: Type.STRING, description: "Term name" },
                        definition: { type: Type.STRING, description: "Direct educational definition" }
                      },
                      required: ["term", "definition"]
                    },
                    description: "List of key definitions"
                  },
                  mechanisms: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Step-by-step description of processes or pathways"
                  },
                  examPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exam-oriented tips and points"
                  },
                  memoryCues: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Acronyms, mnemonics, or memory tricks"
                  },
                  vivaQuestions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Interactive oral prep questions"
                  }
                },
                required: [
                  "title",
                  "summary",
                  "keyConcepts",
                  "definitions",
                  "mechanisms",
                  "examPoints",
                  "memoryCues",
                  "vivaQuestions"
                ]
              }
            }
          });
          noteContent = response.text || "";
          if (noteContent) {
            successfulModel = mName;
            if (process.env.NODE_ENV !== "production") {
              console.log(`[STUDY NOTE DIAGNOSTIC] Gemini request succeeded ✓ (Model: ${mName}, Structured output returned, length: ${noteContent.length} chars)`);
            }
            break;
          }
        } catch (err: any) {
          lastNoteErr = err;
          console.warn(`[STUDY NOTE DIAGNOSTIC] Model ${mName} failed ✗:`, err?.message || err);
        }
      }

      if (!noteContent) {
        console.error("[STUDY NOTE DIAGNOSTIC] Gemini request failed across all models ✗. Last error:", lastNoteErr);
        return res.status(503).json({ 
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI service is temporarily busy. Please try again." 
        });
      }

      let noteObj: any;
      try {
        noteObj = JSON.parse(noteContent);
        if (process.env.NODE_ENV !== "production") {
          console.log("[STUDY NOTE DIAGNOSTIC] Structured JSON response parsed successfully ✓");
        }
      } catch (jsonErr: any) {
        console.error("[STUDY NOTE DIAGNOSTIC] Structured JSON parsing failed ✗:", jsonErr);
        return res.status(503).json({ 
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI service is temporarily busy. Please try again." 
        });
      }

      const hasRequiredFields = noteObj && 
        typeof noteObj.title === 'string' && 
        typeof noteObj.summary === 'string' && 
        noteObj.title.trim().length > 0 && 
        noteObj.summary.trim().length > 0;

      if (!hasRequiredFields) {
        console.error("[STUDY NOTE DIAGNOSTIC] StudyNote validation failed ✗ (Missing required title or summary fields in JSON)");
        return res.status(503).json({ 
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI service is temporarily busy. Please try again." 
        });
      }
      if (process.env.NODE_ENV !== "production") {
        console.log(`[STUDY NOTE DIAGNOSTIC] StudyNote validation succeeded ✓`);
      }

      const sourceTitle = sources.length > 0 ? sources[0].title : "General Knowledge";

      const compiledNote = {
        userId,
        title: String(noteObj.title).trim(),
        summary: String(noteObj.summary).trim(),
        keyConcepts: Array.isArray(noteObj.keyConcepts) ? noteObj.keyConcepts.map(String) : [],
        definitions: Array.isArray(noteObj.definitions) 
          ? noteObj.definitions
              .filter((d: any) => d && typeof d === 'object' && d.term && d.definition)
              .map((d: any) => ({ term: String(d.term), definition: String(d.definition) }))
          : [],
        mechanisms: Array.isArray(noteObj.mechanisms) ? noteObj.mechanisms.map(String) : [],
        examPoints: Array.isArray(noteObj.examPoints) ? noteObj.examPoints.map(String) : [],
        memoryCues: Array.isArray(noteObj.memoryCues) ? noteObj.memoryCues.map(String) : [],
        vivaQuestions: Array.isArray(noteObj.vivaQuestions) ? noteObj.vivaQuestions.map(String) : [],
        sourceTitle,
        createdAt: new Date().toISOString(),
        isFavorite: false
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("[STUDY NOTE DIAGNOSTIC] Server returning generated note successfully to frontend ✓");
      }
      return res.json({
        success: true,
        note: {
          id: Math.random().toString(36).substring(7),
          ...compiledNote,
          createdAt: new Date(compiledNote.createdAt)
        }
      });
    } catch (error: any) {
      console.error("[STUDY NOTE DIAGNOSTIC EXCEPTION] ", error);
      return res.status(503).json({ 
        success: false,
        error: "TEMPORARY_AI_FAILURE",
        message: "The AI service is temporarily busy. Please try again." 
      });
    }
  });

  // Helper for concept normalization
  function normalizeConceptName(name: string): string {
    return (name || "").toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
  }

  // 4. Generate Smart Revision Plan
  app.post("/api/revision/plan", requireAuth, async (req, res) => {
    try {
      const { materialId, duration } = req.body;
      const userId = (req as any).user.uid;
      if (!materialId) return res.status(400).json({ error: "Missing required revision parameters." });

      // Fetch Material Chunks
      const chunksSnap = await db.collection("chunks").where("documentId", "==", materialId).where("userId", "==", userId).get();
      const context = chunksSnap.docs.map((d: any) => d.data().text).join("\n\n").substring(0, 5000);

      // Fetch Previous Completed Revision Sessions for this material safely
      const previousConcepts: string[] = [];
      try {
        const prevSessionsSnap = await db.collection("revisionSessions").where("userId", "==", userId).get();
        prevSessionsSnap.docs.forEach((d: any) => {
          const data = d.data();
          if (data.materialId === materialId && Array.isArray(data.conceptsCovered)) {
            data.conceptsCovered.forEach((c: any) => {
              if (c.concept) previousConcepts.push(c.concept);
            });
          }
        });
      } catch (e) {
        console.warn("Could not fetch previous revision sessions:", e);
      }

      // Fetch History
      const msgs = (await db.collection("messages").where("userId", "==", userId).get()).docs.map((d: any) => d.data());
      const viva = (await db.collection("vivaResponses").where("userId", "==", userId).get()).docs.map((d: any) => d.data());
      const notes = (await db.collection("notes").where("userId", "==", userId).get()).docs.map((d: any) => d.data());

      const prompt = `Act as an expert academic tutor. Analyze the student's study data to create a ${duration}-minute revision plan for this study material.

      Study Material: ${context.substring(0, 2000)}...

      Previously Covered Concepts in Past Revision Sessions:
      ${JSON.stringify(previousConcepts)}

      Student History:
      - Chat History: ${JSON.stringify(msgs.slice(-5)).substring(0, 500)}
      - Viva Responses: ${JSON.stringify(viva.slice(-5)).substring(0, 500)}
      - Existing Notes: ${JSON.stringify(notes.slice(-5)).substring(0, 500)}

      Requirements:
      1. Identify 3-5 concepts to revise.
      2. PREFER NEW OR UNSEEN CONCEPTS that have NOT been recently covered in the "Previously Covered Concepts" list above, unless all important material concepts have already been covered (in which case prioritize older or weaker concepts). Do not permanently exclude concepts if they need reinforcement.
      3. Prioritize based on core material importance and student history. Do not invent weaknesses or fake data.
      4. Structured Output: Return ONLY pure JSON, no markdown, matching this exact schema:
      {
        "concepts": [
          {
            "name": "Concept name",
            "why": "Short student-friendly reason to revise it",
            "quickReminder": "Very short source-grounded reminder",
            "priority": "high" or "medium"
          }
        ]
      }
      `;

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: { temperature: 0.2, responseMimeType: "application/json" }
      });
      
      const plan = robustParseJSON(response.text || "{}");
      return res.json({ success: true, plan });
    } catch (err: any) {
      console.error("Revision plan error:", err);
      return res.status(500).json({ error: "Failed to generate plan." });
    }
  });

  // 4b. Save Completed Revision Session
  app.post("/api/revision/complete", requireAuth, async (req, res) => {
    try {
      const { materialId, materialTitle, sessionId, duration, conceptsCovered, startedAt } = req.body;
      const userId = (req as any).user.uid;
      if (!materialId || !sessionId) {
        return res.status(400).json({ error: "Missing required completion parameters." });
      }

      // Check if session already saved to prevent duplicates
      const existingSnap = await db.collection("revisionSessions").where("sessionId", "==", sessionId).get();
      if (!existingSnap.empty) {
        return res.json({ success: true, message: "Session already recorded." });
      }

      const sessionData = {
        userId,
        materialId,
        materialTitle: materialTitle || "",
        sessionId,
        duration: duration || 10,
        conceptsCovered: (conceptsCovered || []).map((c: any) => ({
          concept: c.concept,
          normalizedConcept: normalizeConceptName(c.concept),
          completed: true,
          status: c.evaluation?.status || "reviewed",
          performance: c.evaluation || null
        })),
        startedAt: startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        createdAt: FieldValue.serverTimestamp()
      };

      await db.collection("revisionSessions").add(sessionData);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Save revision session error:", err);
      return res.status(500).json({ error: "Failed to save completed revision session." });
    }
  });

  // 4c. Smart Revision Question TTS Endpoint
  app.post("/api/revision/tts", requireAuth, async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing text for TTS." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: text,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          }
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      if (part && part.inlineData && part.inlineData.data) {
        return res.json({
          success: true,
          audioBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "audio/wav"
        });
      } else {
        throw new Error("No audio data returned from Gemini TTS model.");
      }
    } catch (err: any) {
      console.error("Smart Revision TTS error:", err);
      return res.status(500).json({ error: err.message || "Failed to generate TTS audio." });
    }
  });


  // 4d. Generate Revision Note from completed Smart Revision session
  app.post("/api/revision/note/generate", requireAuth, async (req, res) => {
    try {
      const { materialId, materialTitle, sessionId, conceptsCovered } = req.body;
      const userId = (req as any).user.uid;
      if (!materialId) {
        return res.status(400).json({ error: "Missing required parameters for revision note generation." });
      }

      if (!Array.isArray(conceptsCovered) || conceptsCovered.length === 0) {
        return res.status(400).json({ error: "Please complete at least one revision concept before generating a Revision Note." });
      }

      // Load material chunks
      const chunksSnap = await db.collection("chunks").where("documentId", "==", materialId).where("userId", "==", userId).get();
      const context = chunksSnap.docs.map((d: any) => d.data().text).join("\n\n").substring(0, 6000);

      const prompt = `Act as an expert academic tutor. Generate a compact, high-yield Revision Note for quick exam review based on the student's actual completed Smart Revision session and study material.

      Study Material Title: ${materialTitle || "Study Material"}
      Study Material Context:
      ${context.substring(0, 3000)}

      Smart Revision Completed Concepts & Student Performance:
      ${JSON.stringify(conceptsCovered)}

      Requirements:
      1. Create compact last-minute exam revision notes (not full study notes).
      2. Base content strictly on the study material and completed revision session data. Do not invent facts.
      3. Return ONLY pure JSON matching this exact schema:
      {
        "topic": "Topic title for the revision note",
        "coreIdea": "A concise 1-2 sentence core takeaway summarizing the main idea",
        "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
        "mustRemember": ["Crucial fact 1", "Crucial fact 2"],
        "commonConfusion": ["Common misconception or pitfall 1"],
        "examFocus": ["High-yield exam angle 1", "High-yield exam angle 2"],
        "quickSelfCheck": [
          { "question": "Self-check question 1?", "answer": "Brief answer 1" },
          { "question": "Self-check question 2?", "answer": "Brief answer 2" },
          { "question": "Self-check question 3?", "answer": "Brief answer 3" }
        ]
      }
      `;

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });

      const noteData = robustParseJSON(response.text || "{}");
      if (!noteData || !noteData.topic || !noteData.coreIdea || !Array.isArray(noteData.keyPoints)) {
        throw new Error("Generated note structure is invalid.");
      }

      return res.json({ success: true, note: noteData });
    } catch (err: any) {
      console.error("Generate revision note error:", err);
      return res.status(500).json({ error: err.message || "Revision Note could not be generated. Please try again." });
    }
  });

  // 5. Generate Grounded Smart Revision Question
  app.post("/api/revision/question", requireAuth, async (req, res) => {
    try {
      const { concept, materialId, history = [] } = req.body;
      const userId = (req as any).user.uid;

      // Load material chunks internally
      const chunksSnap = await db.collection("chunks").where("documentId", "==", materialId).where("userId", "==", userId).get();
      const materialContext = chunksSnap.docs.map((d: any) => d.data().text).join("\n\n");

      const prompt = `Act as a supportive academic tutor. Generate ONE revision question for the concept: "${concept.name}".
      
      Explanation to reinforce: ${concept.explanation}
      
      Material Context: ${materialContext.substring(0, 2000)}
      
      Requirements:
      1. Test understanding, not just memorization.
      2. Use a mix of recall and application.
      3. Do not repeat previous questions in history: ${JSON.stringify(history)}
      4. Structured Output (JSON only):
      {
        "question": "The question text",
        "expectedPoints": ["Point 1", "Point 2"]
      }
      `;

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: { temperature: 0.3, responseMimeType: "application/json" }
      });
      
      const questionData = robustParseJSON(response.text || "{}");
      
      return res.json({ success: true, ...questionData });
    } catch (err: any) {
      console.error("Revision question error:", err);
      return res.status(500).json({ error: "Failed to generate question." });
    }
  });

  // 6. Evaluate Smart Revision Answer
  app.post("/api/revision/evaluate", requireAuth, async (req, res) => {
    try {
      const { question, answer, expectedPoints } = req.body;
      const prompt = `Evaluate the student answer for the revision question: "${question}".
      
      Expected points: ${JSON.stringify(expectedPoints)}
      Student answer: "${answer}"
      
      Requirements:
      1. Determine if the answer is correct, partially correct, or incorrect.
      2. Identify what the student got right.
      3. Identify what key point they missed (if any).
      4. Provide a short "Remember this" takeaway.
      5. Structured Output (JSON only):
      {
        "status": "correct" | "partial" | "incorrect",
        "feedback": "Concise supportive teacher feedback",
        "gotRight": "What the student got right",
        "missed": "Important point missed or null",
        "takeaway": "Short 'Remember this' takeaway"
      }
      `;

      const response = await generateContentWithRetry({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: { temperature: 0.2, responseMimeType: "application/json" }
      });
      
      const evalData = robustParseJSON(response.text || "{}");
      return res.json({ success: true, ...evalData });
    } catch (err: any) {
      console.error("Revision evaluation error:", err);
      return res.status(500).json({ error: "Failed to evaluate answer." });
    }
  });

  // 1. Generate Grounded & Adaptive Viva Question
  app.post("/api/viva/generate", requireAuth, async (req, res) => {
    try {
      const { 
        documentId, 
        documentTitle, 
        questionNumber = 1, 
        currentDifficulty = "intermediate",
        previousQuestions = [],
        previousEvaluations = [],
        conceptsTested = [],
        conceptsNeedingReview = []
      } = req.body;
      const userId = (req as any).user.uid;

      if (!documentId && !documentTitle) {
        return res.status(400).json({ success: false, message: "Missing document identifier." });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[VIVA V2 GENERATE] Question Q#${questionNumber} | Difficulty: ${currentDifficulty}`);
      }

      // Retrieve relevant material content or chunks from Firestore
      let materialContext = "";
      const chunksSnap = await db.collection("chunks").where("userId", "==", userId).get();

      const matchingChunks: any[] = [];
      chunksSnap.forEach((docSnap: any) => {
        const data = docSnap.data();
        const docName = data.documentTitle || "";
        const docId = data.documentId || "";
        if (
          (documentId && docId === documentId) ||
          (documentTitle && docName.toLowerCase().includes(documentTitle.toLowerCase())) ||
          (documentTitle && documentTitle.toLowerCase().includes(docName.toLowerCase()))
        ) {
          matchingChunks.push(data);
        }
      });

      if (matchingChunks.length > 0) {
        matchingChunks.sort((a, b) => (a.indexOrder || 0) - (b.indexOrder || 0));
        // Rotate chunk windows based on question number to cover broader syllabus content
        const startIndex = ((questionNumber - 1) * 2) % matchingChunks.length;
        const selectedChunks = matchingChunks.slice(startIndex, startIndex + 4);

        materialContext = selectedChunks.map(c => `[Excerpt (p. ${c.pageNumber || 1})]: ${c.text}`).join("\n\n");
      }

      // Fallback to documents collection if no chunks found
      if (!materialContext) {
        const docsSnap = await db.collection("documents").where("userId", "==", userId).get();
        docsSnap.forEach((docSnap: any) => {
          const data = docSnap.data();
          if (
            (documentId && docSnap.id === documentId) ||
            (documentTitle && data.title?.toLowerCase().includes(documentTitle.toLowerCase()))
          ) {
            materialContext = (data.content || "").substring(0, 3000);
          }
        });
      }

      if (!materialContext) {
        return res.status(400).json({ 
          success: false, 
          message: "Could not find study material content. Please ensure the document is uploaded." 
        });
      }

      // Build adaptive examiner instructions based on previous response evaluation
      let adaptiveInstructions = "";

      if (questionNumber === 1 || previousEvaluations.length === 0) {
        adaptiveInstructions = `
THIS IS QUESTION 1 (START OF EXAM SESSION):
- Start at '${currentDifficulty}' difficulty.
- Select a core foundational mechanism or concept from the syllabus material.
- Set questionType to 'mechanism' or 'foundational'.
- Ensure the question's difficulty matches '${currentDifficulty}' exactly.`;
      } else {
        const lastEval = previousEvaluations[previousEvaluations.length - 1];
        const lastScore = Number(lastEval.score) || 0;
        const lastPerf = lastEval.performance || (lastScore >= 80 ? 'strong' : lastScore >= 60 ? 'partial' : 'weak');
        const lastMissing = Array.isArray(lastEval.missingPoints) ? lastEval.missingPoints.join(', ') : '';
        const lastIncorrect = Array.isArray(lastEval.incorrectPoints) ? lastEval.incorrectPoints.join(', ') : '';
        const lastConcept = lastEval.targetConcept || lastEval.topic || 'the previous topic';

        if (lastPerf === 'strong' || lastScore >= 80) {
          adaptiveInstructions = `
PREVIOUS ANSWER WAS STRONG (Score: ${lastScore}%):
- Student demonstrated solid understanding of "${lastConcept}".
- ADAPTIVE RULE: Increase challenge level or ask a deeper conceptual follow-up!
- TARGET DIFFICULTY: '${currentDifficulty || 'intermediate'}' or 'advanced'.
- RECOMMENDED QUESTION TYPES: 'deeper_reasoning', 'mechanism', 'comparison', or 'application'.
- Formulate a follow-up question that tests why, how, comparison, or practical application related to "${lastConcept}" or the next logical step in the mechanism.
- IMPORTANT: The question must adhere to the difficulty level '${currentDifficulty}'.`;
        } else if (lastPerf === 'partial' || lastScore >= 60) {
          adaptiveInstructions = `
PREVIOUS ANSWER WAS PARTIALLY CORRECT (Score: ${lastScore}%):
- Student missed these specific details: "${lastMissing || 'key steps'}".
- ADAPTIVE RULE: Ask a focused clarification/follow-up targeting the missing details!
- TARGET DIFFICULTY: '${currentDifficulty || 'intermediate'}' (maintain current difficulty).
- RECOMMENDED QUESTION TYPES: 'clarification' or 'follow_up'.
- Formulate a question that directly helps the student clarify and address: "${lastMissing}".
- IMPORTANT: The question must adhere to the difficulty level '${currentDifficulty}'.`;
        } else {
          adaptiveInstructions = `
PREVIOUS ANSWER WAS WEAK OR INCORRECT (Score: ${lastScore}%):
- Student struggled with or had misconceptions about: "${lastMissing || lastIncorrect || lastConcept}".
- ADAPTIVE RULE: Ask a simpler, foundational question targeting the same concept from another angle!
- TARGET DIFFICULTY: 'basic' or 'intermediate'.
- RECOMMENDED QUESTION TYPES: 'foundational' or 'clarification'.
- Give the student an opportunity to demonstrate basic understanding before moving on. Do NOT switch to an completely unrelated topic immediately.
- IMPORTANT: The question must adhere to the difficulty level 'basic' or 'intermediate' as requested by the exam parameters.`;
        }
      }

      const prevQuestionsList = Array.isArray(previousQuestions) && previousQuestions.length > 0 
        ? previousQuestions.map((q, i) => `Q${i+1}: "${q}"`).join('\n') 
        : 'None yet.';

      const conceptsReviewList = Array.isArray(conceptsNeedingReview) && conceptsNeedingReview.length > 0
        ? conceptsNeedingReview.join(', ')
        : 'None';

      const vivaQuestionSchema = {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: "Direct, conceptual oral examination question." },
          difficulty: { type: Type.STRING, description: "basic | intermediate | advanced" },
          questionType: { type: Type.STRING, description: "follow_up | clarification | deeper_reasoning | mechanism | comparison | application | foundational" },
          targetConcept: { type: Type.STRING, description: "The core concept or mechanism targeted by this question." },
          reason: { type: Type.STRING, description: "Short internal reasoning explaining why this question was selected." },
          topic: { type: Type.STRING, description: "Specific topic tested." },
          expectedConcepts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "2-4 key conceptual points expected in a complete answer."
          },
          sourceReferences: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                documentTitle: { type: Type.STRING },
                pageNumber: { type: Type.INTEGER, nullable: true }
              },
              required: ["documentTitle"]
            }
          }
        },
        required: ["question", "difficulty", "questionType", "targetConcept", "reason", "topic", "expectedConcepts", "sourceReferences"]
      };

      const prompt = `You are a university oral examiner conducting an adaptive Viva examination grounded in the student's study material.

SOURCE MATERIAL:
${materialContext}

EXAM CONTEXT:
- Question Number: ${questionNumber} of 5
- Document Title: "${documentTitle || 'Syllabus Source'}"
- Current Target Difficulty: "${currentDifficulty}"
- Concepts Needing Review: ${conceptsReviewList}

PREVIOUSLY ASKED QUESTIONS IN THIS SESSION (STRICT RULE: DO NOT REPEAT ANY OF THESE OR ASK NEAR-DUPLICATES):
${prevQuestionsList}

ADAPTIVE EXAMINER INSTRUCTIONS:
${adaptiveInstructions}

REQUIREMENTS:
1. Formulate ONE clear, natural oral examination question derived STRICTLY from the provided source material.
2. The question MUST NOT repeat or closely resemble any previously asked question.
3. The question must logically connect to the syllabus material and examiner strategy.
4. Set difficulty to 'basic', 'intermediate', or 'advanced'.
5. Set questionType to one of: 'follow_up', 'clarification', 'deeper_reasoning', 'mechanism', 'comparison', 'application', 'foundational'.
6. Provide targetConcept and a concise internal 'reason' for selecting this question.`;

      const vivaModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
      let questionResult: any = null;
      let lastErr: any = null;

      for (const modelAlias of vivaModels) {
        try {
          const response = await generateContentWithRetry({
            model: modelAlias,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: vivaQuestionSchema,
              temperature: 0.3
            }
          });

          if (response?.text) {
            questionResult = JSON.parse(response.text);
            break;
          }
        } catch (err: any) {
          console.warn(`[VIVA GENERATE WARNING] Model ${modelAlias} failed:`, err?.message || err);
          lastErr = err;
        }
      }

      if (!questionResult || !questionResult.question) {
        console.error("[VIVA GENERATE ERROR] All models failed", lastErr);
        return res.status(503).json({
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI examiner is temporarily busy. Please try again."
        });
      }

      let difficulty = String(questionResult.difficulty || currentDifficulty || 'intermediate').toLowerCase().trim();
      if (!['basic', 'intermediate', 'advanced'].includes(difficulty)) {
        difficulty = 'intermediate';
      }

      return res.json({
        success: true,
        data: {
          question: String(questionResult.question).trim(),
          topic: String(questionResult.topic || "Syllabus Concept").trim(),
          difficulty,
          questionType: String(questionResult.questionType || "follow_up").trim(),
          targetConcept: String(questionResult.targetConcept || questionResult.topic || "Core Concept").trim(),
          reason: String(questionResult.reason || "Adaptive examination follow-up").trim(),
          expectedConcepts: Array.isArray(questionResult.expectedConcepts) ? questionResult.expectedConcepts.map(String) : [],
          sourceReferences: Array.isArray(questionResult.sourceReferences) ? questionResult.sourceReferences : [{ documentTitle: documentTitle || "Syllabus Source" }]
        }
      });
    } catch (err: any) {
      console.error("[VIVA GENERATE EXCEPTION]", err);
      return res.status(503).json({
        success: false,
        error: "TEMPORARY_AI_FAILURE",
        message: "The AI examiner is temporarily busy. Please try again."
      });
    }
  });

  // 2. Evaluate Student Viva Answer
  app.post("/api/viva/evaluate", requireAuth, async (req, res) => {
    try {
      const { sessionId, question, studentAnswer, expectedConcepts = [], documentTitle } = req.body;
      const userId = (req as any).user.uid;

      if (!question || !studentAnswer) {
        return res.status(400).json({ success: false, message: "Missing required evaluation fields." });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[VIVA V2 EVALUATE] Session: ${sessionId}`);
      }

      // Retrieve document context for grounded grading
      let materialContext = "";
      const chunksSnap = await db.collection("chunks").where("userId", "==", userId).get();

      chunksSnap.forEach((docSnap: any) => {
        const data = docSnap.data();
        if (documentTitle && (data.documentTitle?.toLowerCase().includes(documentTitle.toLowerCase()) || documentTitle.toLowerCase().includes(data.documentTitle?.toLowerCase()))) {
          materialContext += `\n${data.text}`;
        }
      });

      if (materialContext.length > 3000) {
        materialContext = materialContext.substring(0, 3000);
      }

      const vivaEvalSchema = {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "Score from 0 to 100 based on factual understanding." },
          performance: { type: Type.STRING, description: "strong | partial | weak" },
          assessment: { type: Type.STRING, description: "1-2 sentence constructive examiner assessment." },
          correctPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Specific key points the student answered correctly."
          },
          missingPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key points or concepts that were missing or incomplete."
          },
          incorrectPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Factual inaccuracies or misconceptions present in the answer."
          },
          conceptsDemonstrated: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key concepts or terms the student successfully demonstrated."
          },
          conceptsToReview: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key concepts or topics needing further review based on this answer."
          },
          recommendedDifficulty: { type: Type.STRING, description: "basic | intermediate | advanced" },
          idealAnswer: { type: Type.STRING, description: "A concise, accurate model answer grounded in the material." },
          importantTerms: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key technical terms relevant to this question."
          },
          topic: { type: Type.STRING, description: "Topic area evaluated." }
        },
        required: ["score", "performance", "assessment", "correctPoints", "missingPoints", "incorrectPoints", "conceptsDemonstrated", "conceptsToReview", "recommendedDifficulty", "idealAnswer", "importantTerms", "topic"]
      };

      const prompt = `You are an expert oral Viva examiner grading a university student's answer.

QUESTION ASKED:
"${question}"

EXPECTED CONCEPTS:
${JSON.stringify(expectedConcepts)}

STUDENT'S SPOKEN/TYPED ANSWER:
"${studentAnswer}"

REFERENCE SYLLABUS MATERIAL:
${materialContext || "Grounded in standard syllabus definition."}

GRADING CRITERIA:
1. Assign a numeric score from 0 to 100 reflecting factual understanding:
   - 85-100: Deep, accurate explanation covering key mechanisms and technical terms.
   - 65-84: Correct core concept but missing minor details or steps.
   - 40-64: Partially correct, vague, or missing primary mechanisms.
   - 0-39: Incorrect, off-topic, or missing fundamental facts (or "I don't know").
2. Set "performance":
   - "strong" if score >= 80
   - "partial" if score is 60-79
   - "weak" if score < 60
3. Set "recommendedDifficulty" for the NEXT question:
   - "advanced" or "intermediate" if performance is "strong"
   - "intermediate" or "basic" if performance is "partial"
   - "basic" or "intermediate" if performance is "weak"
4. Do NOT give high scores for superficial fluency without factual substance.
5. Do NOT penalize minor phrasing differences if the underlying concept is correct.
6. Extract clear arrays for:
   - "correctPoints": what the student got right
   - "missingPoints": what key elements were missing
   - "incorrectPoints": any direct factual errors or misconceptions
   - "conceptsDemonstrated": concepts proved understood
   - "conceptsToReview": concepts needing further drill
7. Provide a concise ideal model answer grounded in the syllabus.`;

      const vivaModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
      let evalResult: any = null;
      let lastErr: any = null;

      for (const modelAlias of vivaModels) {
        try {
          const response = await generateContentWithRetry({
            model: modelAlias,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: vivaEvalSchema,
              temperature: 0.2
            }
          });

          if (response?.text) {
            evalResult = JSON.parse(response.text);
            break;
          }
        } catch (err: any) {
          console.warn(`[VIVA EVALUATE WARNING] Model ${modelAlias} failed:`, err?.message || err);
          lastErr = err;
        }
      }

      if (!evalResult || typeof evalResult.score !== "number") {
        console.error("[VIVA EVALUATE ERROR] All models failed", lastErr);
        return res.status(503).json({
          success: false,
          error: "TEMPORARY_AI_FAILURE",
          message: "The AI examiner is temporarily busy. Please try again."
        });
      }

      const score = Math.min(100, Math.max(0, Math.round(Number(evalResult.score) || 0)));
      let performance = String(evalResult.performance || '').toLowerCase().trim();
      if (!['strong', 'partial', 'weak'].includes(performance)) {
        performance = score >= 80 ? 'strong' : score >= 60 ? 'partial' : 'weak';
      }
      let recommendedDifficulty = String(evalResult.recommendedDifficulty || '').toLowerCase().trim();
      if (!['basic', 'intermediate', 'advanced'].includes(recommendedDifficulty)) {
        recommendedDifficulty = performance === 'strong' ? 'advanced' : performance === 'partial' ? 'intermediate' : 'basic';
      }

      return res.json({
        success: true,
        data: {
          score,
          performance,
          assessment: String(evalResult.assessment || "").trim(),
          correctPoints: Array.isArray(evalResult.correctPoints) ? evalResult.correctPoints.map(String) : [],
          missingPoints: Array.isArray(evalResult.missingPoints) ? evalResult.missingPoints.map(String) : [],
          incorrectPoints: Array.isArray(evalResult.incorrectPoints) ? evalResult.incorrectPoints.map(String) : [],
          conceptsDemonstrated: Array.isArray(evalResult.conceptsDemonstrated) ? evalResult.conceptsDemonstrated.map(String) : [],
          conceptsToReview: Array.isArray(evalResult.conceptsToReview) ? evalResult.conceptsToReview.map(String) : [],
          recommendedDifficulty,
          idealAnswer: String(evalResult.idealAnswer || "").trim(),
          importantTerms: Array.isArray(evalResult.importantTerms) ? evalResult.importantTerms.map(String) : [],
          topic: String(evalResult.topic || "Syllabus Topic").trim()
        }
      });
    } catch (err: any) {
      console.error("[VIVA EVALUATE EXCEPTION]", err);
      return res.status(503).json({
        success: false,
        error: "TEMPORARY_AI_FAILURE",
        message: "The AI examiner is temporarily busy. Please try again."
      });
    }
  });

  // --- DEV & PRODUCTION MIDDLEWARES ---

  async function startServer() {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    if (!process.env.VERCEL) {
      const PORT = Number(process.env.PORT) || 3000;
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[Knowva] Server running on http://localhost:${PORT}`);
      });
    }
  }

  startServer();

  export default app;
