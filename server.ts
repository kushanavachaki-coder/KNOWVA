import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  doc,
  updateDoc
} from "firebase/firestore";

// Read Firebase config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

// Initialize Firebase App
const firebaseApp = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || "(default)");

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits higher to support large paste payloads and documents
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // --- API ENDPOINTS ---

  // 1. Process Uploaded/Pasted Document
  app.post("/api/documents/process", async (req, res) => {
    try {
      const { title, type, content, pages, userId = "student-user" } = req.body;

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
      console.log(`[RAG INGEST DIAGNOSTIC 1/5] PDF / Document Received: "${title}" (userId: "${userId}")`);
      console.log(`[RAG INGEST DIAGNOSTIC 2/5] PDF Text Extracted successfully. Character count: ${docFullText.length}`);
      console.log(`[RAG INGEST DIAGNOSTIC 3/5] Chunking completed. Total chunks created: ${rawChunks.length}`);

      const docRef = await addDoc(collection(db, "documents"), {
        userId,
        title,
        type,
        content: docFullText,
        pageCount: type === "pdf" ? pages.length : 1,
        chunkCount: rawChunks.length,
        createdAt: new Date().toISOString()
      });

      console.log(`[RAG INGEST DIAGNOSTIC 5/5] Document master metadata written to Firestore collection "documents". ID: ${docRef.id}`);

      // 2. Generate embeddings for each chunk and save to Firestore
      console.log(`[RAG INGEST DIAGNOSTIC 4/5] Initiating Gemini Embeddings. Model: "gemini-embedding-2"`);
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

      console.log(`[RAG INGEST DIAGNOSTIC] Successfully generated embeddings for ${processedChunks.length}/${rawChunks.length} chunks.`);

      if (processedChunks.length === 0) {
        return res.status(500).json({ 
          error: "Failed to generate embeddings for document content",
          errorStage: "EMBEDDING_FAILED"
        });
      }

      // Write chunks to chunks collection
      const chunkPromises = processedChunks.map(async (pc, index) => {
        return addDoc(collection(db, "chunks"), {
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
      console.log(`[RAG INGEST DIAGNOSTIC] Successfully stored ${chunkPromises.length} chunk documents in Firestore collection "chunks".`);

      // Log study activity
      await addDoc(collection(db, "activity"), {
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

  // Helper for exponential backoff on 503 / UNAVAILABLE errors (throws immediately on 429 quota exhaustion or 404 model config errors)
  async function generateContentWithRetry(params: any, maxRetries = 2, initialDelayMs = 2000) {
    let lastErr: any = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ai.models.generateContent(params);
      } catch (err: any) {
        lastErr = err;
        const errMsg = err?.message || JSON.stringify(err);
        if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
          console.warn(`[GEMINI QUOTA EXCEEDED] Model ${params.model} hit 429 quota limit. Failing over immediately to next model...`);
          throw err;
        }
        if (errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("is not found") || errMsg.includes("not supported")) {
          console.error(`[MODEL CONFIG ERROR] Model ${params.model} is invalid, not found, or not supported: ${errMsg}`);
          throw err;
        }
        if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("overloaded")) {
          const delay = initialDelayMs * Math.pow(1.5, attempt);
          console.warn(`[GEMINI RETRY] Model ${params.model} got 503/UNAVAILABLE. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  // 2. Chat Query & Retrieval (RAG)
  app.post("/api/chat/ask", async (req, res) => {
    try {
      const { question, history = [], userId = "student-user" } = req.body;

      if (!question || question.trim() === "") {
        return res.status(400).json({ error: "Question is required", errorStage: "INVALID_INPUT" });
      }

      console.log(`\n[RAG SEARCH START] User Question: "${question}" (userId: "${userId}")`);

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
      console.log(`[RAG SEARCH STEP 5] Fetching chunks from Firestore where userId == "${userId}"...`);
      let chunksSnap;
      try {
        chunksSnap = await getDocs(
          query(collection(db, "chunks"), where("userId", "==", userId))
        );
      } catch (err: any) {
        console.error("[RAG SEARCH ERROR Stage: CHUNKS_DB_QUERY_FAILED] ", err);
        return res.status(500).json({ 
          error: "Failed to fetch study chunks from Firestore. Please check database permissions or connection.",
          errorStage: "CHUNKS_DB_QUERY_FAILED"
        });
      }

      const allChunks: any[] = [];
      chunksSnap.forEach((doc) => {
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

      console.log(`[RAG SEARCH STEP 6] Retrieved ${allChunks.length} chunks from database. Calculating similarity...`);

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
      console.log(`[RAG SEARCH RETRIEVAL PREVIEW] Found ${topChunks.length} highly matching chunks:`);
      topChunks.forEach((c, idx) => {
        console.log(`  - [Chunk #${idx+1}] File: "${c.documentTitle}" (p. ${c.pageNumber}) | Combined: ${c.similarity.toFixed(3)} (Cosine: ${c.cosineScore.toFixed(3)}, Keyword: ${c.keywordScore.toFixed(3)})`);
        console.log(`    Excerpt: "${c.text.substring(0, 95).replace(/\n/g, ' ')}..."`);
      });

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
      const askModels = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
      let generatedText = "";
      let lastAskErr: any = null;

      for (const mName of askModels) {
        try {
          console.log(`[RAG SEARCH STEP 7] Submitting grounded payload to model: "${mName}"...`);
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
        return res.status(500).json({ 
          error: lastAskErr?.message || "Failed to generate answer from study materials. All Gemini models failed.",
          errorStage: "GEMINI_QA_FAILED"
        });
      }

      // Log study activity
      await addDoc(collection(db, "activity"), {
        userId,
        type: "ask",
        description: `Asked question: "${question.substring(0, 50)}..."`,
        timestamp: new Date().toISOString()
      });

      const isExtraInfo = generatedText.includes("### Extra info") || !hasSourcedContext;
      const groundedStatus = hasSourcedContext 
        ? (isExtraInfo ? "fallback_knowledge" : "study_material") 
        : "fallback_knowledge";

      console.log(`[RAG SEARCH COMPLETED] Grounding outcome: "${groundedStatus}" (isExtraInfo: ${isExtraInfo})`);

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
  app.post("/api/notes/generate", async (req, res) => {
    try {
      const { question, answer, sources = [], userId = "student-user" } = req.body;

      if (!question || !answer) {
        return res.status(400).json({ error: "Question and Answer are required to compile a note" });
      }

      const prompt = `You are a professional study content summarizer. Create a highly detailed, structured study note for a student's personal notes library based strictly on their ask-and-answer interaction and source materials.

      User Question: ${question}
      AI Answer: ${answer}
      Sources Used: ${JSON.stringify(sources)}

      Summarize the actual generated answer and study context accurately. If the answer contains information marked as Extra info, include it properly without pretending general knowledge came from uploaded study material.`;

      let noteContent = "";
      const noteModels = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash"];
      let lastNoteErr: any = null;
      let successfulModel = "";

      for (const mName of noteModels) {
        try {
          console.log(`[STUDY NOTE DIAGNOSTIC] Model attempted: "${mName}"`);
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
            console.log(`[STUDY NOTE DIAGNOSTIC] Gemini request succeeded ✓ (Model: ${mName}, Structured output returned, length: ${noteContent.length} chars)`);
            break;
          }
        } catch (err: any) {
          lastNoteErr = err;
          console.warn(`[STUDY NOTE DIAGNOSTIC] Model ${mName} failed ✗:`, err?.message || err);
        }
      }

      if (!noteContent) {
        console.error("[STUDY NOTE DIAGNOSTIC] Gemini request failed across all models ✗. Last error:", lastNoteErr);
        return res.status(500).json({ error: lastNoteErr?.message || "Failed to generate personalized study note across all models. Please check your API quota or key." });
      }

      let noteObj: any;
      try {
        noteObj = JSON.parse(noteContent);
        console.log("[STUDY NOTE DIAGNOSTIC] Structured JSON response parsed successfully ✓");
      } catch (jsonErr: any) {
        console.error("[STUDY NOTE DIAGNOSTIC] Structured JSON parsing failed ✗:", jsonErr, "Raw output:", noteContent);
        return res.status(500).json({ error: "Failed to parse structured study note response from AI." });
      }

      const hasRequiredFields = noteObj && typeof noteObj.title === 'string' && typeof noteObj.summary === 'string';
      if (!hasRequiredFields) {
        console.error("[STUDY NOTE DIAGNOSTIC] StudyNote validation failed ✗ (Missing required title or summary fields in JSON)");
        return res.status(500).json({ error: "Generated study note is missing required fields." });
      }
      console.log(`[STUDY NOTE DIAGNOSTIC] StudyNote validation succeeded ✓ (Title: '${noteObj.title}')`);

      const sourceTitle = sources.length > 0 ? sources[0].title : "General Knowledge";

      const compiledNote = {
        userId,
        title: noteObj.title,
        summary: noteObj.summary,
        keyConcepts: noteObj.keyConcepts || [],
        definitions: noteObj.definitions || [],
        mechanisms: noteObj.mechanisms || [],
        examPoints: noteObj.examPoints || [],
        memoryCues: noteObj.memoryCues || [],
        vivaQuestions: noteObj.vivaQuestions || [],
        sourceTitle,
        createdAt: new Date().toISOString(),
        isFavorite: false
      };

      console.log("[STUDY NOTE DIAGNOSTIC] Server returning generated note successfully to frontend ✓");
      return res.json({
        success: true,
        note: {
          id: Math.random().toString(36).substring(7),
          ...compiledNote,
          createdAt: new Date(compiledNote.createdAt)
        }
      });
    } catch (error: any) {
      console.error("Error in notes generation: ", error);
      return res.status(500).json({ error: error.message || "Failed to compile study note" });
    }
  });

  // --- DEV & PRODUCTION MIDDLEWARES ---

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Knowva] Server running on http://localhost:${PORT}`);
  });
}

startServer();
