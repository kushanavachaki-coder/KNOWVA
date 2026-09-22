import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
    console.log("Connecting to database ID:", config.firestoreDatabaseId);
    
    const docsSnap = await getDocs(collection(db, "documents"));
    console.log(`\nTotal Documents stored in Firestore: ${docsSnap.size}`);
    docsSnap.forEach(doc => {
      console.log(`- Doc ID: ${doc.id}, Title: "${doc.data().title}", Type: ${doc.data().type}, Pages: ${doc.data().pageCount}, Chunks: ${doc.data().chunkCount}`);
    });

    const chunksSnap = await getDocs(query(collection(db, "chunks"), limit(5)));
    console.log(`\nTotal Chunks samples retrieved (limit 5): ${chunksSnap.size}`);
    chunksSnap.forEach(doc => {
      const data = doc.data();
      const textLen = data.text ? data.text.length : 0;
      const embedLen = data.embedding ? data.embedding.length : 0;
      console.log(`- Chunk ID: ${doc.id}, DocID: ${data.documentId}, Title: "${data.documentTitle}", TextLength: ${textLen}, EmbeddingDims: ${embedLen}`);
      if (embedLen > 0) {
        console.log(`  Embedding slice (first 5):`, data.embedding.slice(0, 5));
      }
    });

    process.exit(0);
  } catch (err) {
    console.error("Firestore query failed:", err);
    process.exit(1);
  }
}

run();
