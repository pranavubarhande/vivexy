import os
import tempfile
from typing import List, TypedDict

import pandas as pd
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredExcelLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_core.documents import Document
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import StateGraph
from pinecone import Pinecone, ServerlessSpec
from rank_bm25 import BM25Okapi

from configs import Config


# ==========================================================
# LOAD & PROCESS DOCUMENTS
# ==========================================================
def load_docs(file_path, csv_dataframes):
    try:
        if file_path.endswith(".pdf"):
            return PyPDFLoader(file_path).load()
        elif file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
            csv_dataframes[file_path] = df
            docs = []
            for i, row in df.iterrows():
                docs.append(
                    Document(
                        page_content=" | ".join([f"{k}: {v}" for k, v in row.items()]),
                        metadata={"source": file_path, "row": i, "type": "csv"},
                    )
                )
            return docs
        elif file_path.endswith(".xlsx"):
            return UnstructuredExcelLoader(file_path).load()
        elif file_path.endswith(".docx"):
            return UnstructuredWordDocumentLoader(file_path).load()
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
    return []


# ==========================================================
# AGENT STATE
# ==========================================================
class AgentState(TypedDict):
    question: str
    retrieved_docs: List[Document]
    routing_decision: str
    analysis: str
    answer: str


# ==========================================================
# HYBRID SEARCH (Vector + BM25)
# ==========================================================
def hybrid_search(
    query: str, index, bm25, chunks, embeddings_model, k: int = Config.TOP_K_RETRIEVAL
) -> List[Document]:
    """Combine semantic (vector) and lexical (BM25) search"""

    # Vector search
    query_vector = embeddings_model.embed_query(query)
    vector_results = index.query(vector=query_vector, top_k=k, include_metadata=True)
    vector_docs = [
        Document(
            page_content=match["metadata"]["text"],
            metadata={k: v for k, v in match["metadata"].items() if k != "text"},
        )
        for match in vector_results["matches"]
    ]

    # BM25 search
    tokenized_query = query.split()
    bm25_scores = bm25.get_scores(tokenized_query)
    top_bm25_indices = sorted(
        range(len(bm25_scores)), key=lambda i: bm25_scores[i], reverse=True
    )[: Config.BM25_K]

    # Combine results
    result_docs = vector_docs.copy()
    seen_content = set(doc.page_content for doc in result_docs)

    for idx in top_bm25_indices:
        if idx < len(chunks):
            doc = chunks[idx]
            if doc.page_content not in seen_content:
                result_docs.append(doc)
                seen_content.add(doc.page_content)

    return result_docs[:k]


# ==========================================================
# LLM SETUP
# ==========================================================
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    max_tokens=2048,
    api_key=Config.GOOGLE_AI_API_KEY,
)


# ==========================================================
# STEP 1: SEMANTIC ROUTER
# ==========================================================
def semantic_router(state: AgentState) -> str:
    """Use LLM to classify query type"""

    query = state["question"]

    routing_prompt = f"""Classify this query into ONE category:

1. "csv_analysis" - If asking for statistics, aggregations, or data operations on CSV/table data
2. "document_qa" - If asking about information in PDFs, documents, or general knowledge
3. "file_list" - If asking about available files
4. "hybrid" - If requires both document search AND data analysis

Query: {query}

Respond with ONLY the category name (no explanation)."""

    try:
        response = llm.invoke(routing_prompt).content.strip().lower()
        valid_routes = ["csv_analysis", "document_qa", "file_list", "hybrid"]
        route = next((r for r in valid_routes if r in response), "document_qa")
        return route
    except:
        return "document_qa"


# ==========================================================
# STEP 2: DOCUMENT RETRIEVAL
# ==========================================================
def retrieve_documents(
    state: AgentState, index, bm25, chunks, embeddings_model
) -> dict:
    """Retrieve relevant documents using hybrid search"""

    docs = hybrid_search(state["question"], index, bm25, chunks, embeddings_model)
    route = semantic_router(state)

    return {"retrieved_docs": docs, "routing_decision": route}


# ==========================================================
# STEP 3: FILE LISTING
# ==========================================================
def file_list_handler(state: AgentState, documents) -> dict:
    """Handle file listing queries"""

    unique_files = set(
        doc.metadata.get("source_file")
        for doc in documents
        if "source_file" in doc.metadata
    )

    if not unique_files:
        answer = "No files loaded."
    else:
        file_info = "\n".join([f"  • {f}" for f in sorted(unique_files)])
        answer = f"Available files:\n{file_info}"

    return {"answer": answer, "analysis": "file_list"}


# ==========================================================
# STEP 4: CSV ANALYTICS
# ==========================================================
def csv_analytics_handler(state: AgentState, csv_dataframes) -> dict:
    """Execute data analysis on CSV files"""

    query = state["question"]

    if not csv_dataframes:
        return {"answer": "No CSV files available.", "analysis": "csv_analysis"}

    dataframes_info = "\n".join(
        f"- '{name}': columns {list(df.columns)}" for name, df in csv_dataframes.items()
    )

    code_prompt = f"""You are a data analyst. Write Python code to answer the question.

Available DataFrames in csv_dataframes dict:
{dataframes_info}

Question: {query}

Requirements:
1. Import pandas as pd if needed
2. Access dataframes: df = csv_dataframes['filename.csv']
3. Store final answer in `result` variable
4. For display queries, use df.to_string() or df.describe()

Write ONLY the Python code block:"""

    try:
        response = llm.invoke(code_prompt).content
        code = response.strip()
        if code.startswith("```"):
            code = code.split("```")[1]
            if code.startswith("python"):
                code = code[6:]

        local_env = {"csv_dataframes": csv_dataframes, "pd": pd, "result": None}

        exec(code, {"pd": pd, "csv_dataframes": csv_dataframes}, local_env)
        result = local_env.get("result", "Analysis completed")

        if isinstance(result, pd.DataFrame):
            result = result.to_string()

        answer = f"Analysis Result:\n{str(result)}"
        analysis = "csv_analysis"
    except Exception as e:
        answer = (
            f"Error: {str(e)}\n\nNote: Ensure code uses csv_dataframes dict correctly."
        )
        analysis = "csv_analysis_error"

    return {"answer": answer, "analysis": analysis}


# ==========================================================
# STEP 5: DOCUMENT QA
# ==========================================================
def document_qa_handler(state: AgentState) -> dict:
    """Answer questions using retrieved documents"""

    query = state["question"]
    docs = state["retrieved_docs"]

    if not docs:
        return {
            "answer": "No relevant documents found to answer this question.",
            "analysis": "no_docs_found",
        }

    # Build context with citations
    context_parts = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("source_file", "Unknown")
        row = doc.metadata.get("row", "")
        page = doc.metadata.get("page", "")

        citation = f"[{i}] {source}"
        if row != "" and row is not None:
            citation += f" (Row {row})"
        if page != "" and page is not None:
            citation += f" (Page {page})"

        context_parts.append(f"{citation}\n{doc.page_content}")

    context = "\n\n---\n\n".join(context_parts)

    qa_prompt = f"""You are a legal and compliance analyst. Answer the question using the provided context.

INSTRUCTIONS:
1. Answer directly from context
2. Cite sources using [1], [2], etc. format
3. If information is not in context, say "Not found in available documents"
4. Be precise and accurate

Context:
{context}

Question: {query}

Answer:"""

    answer = llm.invoke(qa_prompt).content

    return {"answer": answer, "analysis": "document_qa"}


# ==========================================================
# STEP 6: HYBRID HANDLER
# ==========================================================
def hybrid_handler(state: AgentState, csv_dataframes) -> dict:
    """Handle queries needing both document search and data analysis"""

    doc_result = document_qa_handler(state)
    csv_result = csv_analytics_handler(state, csv_dataframes)

    combined = f"📄 Document Analysis:\n{doc_result['answer']}\n\n📊 Data Analysis:\n{csv_result['answer']}"

    return {"answer": combined, "analysis": "hybrid"}


# ==========================================================
# LANGGRAPH WORKFLOW
# ==========================================================
def route_handler(state: AgentState) -> str:
    """Route to appropriate handler"""
    route = state["routing_decision"]
    if "file" in route:
        return "file_list"
    elif "csv" in route:
        return "csv_analytics"
    elif "hybrid" in route:
        return "hybrid"
    else:
        return "document_qa"


def process_rag_query(query: str, files):
    """Main function to process RAG query with files"""
    try:
        if not query:
            raise ValueError("Query is required")

        if not files:
            raise ValueError("At least one file is required")

        # Save files temporarily
        temp_dir = tempfile.mkdtemp()
        file_paths = []
        for file in files:
            if file.filename:
                file_path = os.path.join(temp_dir, file.filename)
                file.save(file_path)
                file_paths.append(file_path)

        # Load documents
        documents = []
        csv_dataframes = {}
        for file_path in file_paths:
            docs = load_docs(file_path, csv_dataframes)
            for d in docs:
                d.metadata["source_file"] = os.path.basename(file_path)
                documents.append(d)

        if not documents:
            raise ValueError("No documents could be loaded from the files")

        # Chunking & embeddings
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=Config.CHUNK_SIZE,
            chunk_overlap=Config.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        chunks = []
        for doc in documents:
            doc_chunks = text_splitter.split_text(doc.page_content)
            for chunk in doc_chunks:
                chunks.append(
                    Document(page_content=chunk, metadata=doc.metadata.copy())
                )

        # Create embeddings model
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        # Pinecone client
        pc = Pinecone(api_key=Config.PINECONE_API_KEY)

        # Create index if not exists
        if Config.PINECONE_INDEX_NAME not in [idx.name for idx in pc.list_indexes()]:
            pc.create_index(
                name=Config.PINECONE_INDEX_NAME,
                dimension=384,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )

        index = pc.Index(Config.PINECONE_INDEX_NAME)

        # Embed and upsert
        vectors = []
        for i, chunk in enumerate(chunks):
            vector = embeddings.embed_query(chunk.page_content)
            metadata = {
                k: v
                for k, v in chunk.metadata.items()
                if isinstance(v, (str, int, float, bool))
            }
            metadata["text"] = chunk.page_content
            vectors.append({"id": f"chunk_{i}", "values": vector, "metadata": metadata})

        index.upsert(vectors=vectors)

        # BM25
        bm25_texts = [doc.page_content for doc in chunks]
        bm25 = BM25Okapi(bm25_texts)

        # Build graph
        graph = StateGraph(AgentState)
        graph.add_node(
            "retrieve",
            lambda state: retrieve_documents(state, index, bm25, chunks, embeddings),
        )
        graph.add_node("file_list", lambda state: file_list_handler(state, documents))
        graph.add_node(
            "csv_analytics", lambda state: csv_analytics_handler(state, csv_dataframes)
        )
        graph.add_node("document_qa", document_qa_handler)
        graph.add_node("hybrid", lambda state: hybrid_handler(state, csv_dataframes))

        graph.set_entry_point("retrieve")
        graph.add_conditional_edges(
            "retrieve",
            route_handler,
            {
                "file_list": "file_list",
                "csv_analytics": "csv_analytics",
                "document_qa": "document_qa",
                "hybrid": "hybrid",
            },
        )

        graph.set_finish_point("file_list")
        graph.set_finish_point("csv_analytics")
        graph.set_finish_point("document_qa")
        graph.set_finish_point("hybrid")

        app_graph = graph.compile()

        # Invoke
        result = app_graph.invoke(
            {
                "question": query,
                "retrieved_docs": [],
                "routing_decision": "",
                "analysis": "",
                "answer": "",
            }
        )

        answer = result.get("answer", "No answer generated")
        analysis = result.get("analysis", "unknown")

        # Clean up temp files
        import shutil

        shutil.rmtree(temp_dir)

        return {"answer": answer, "analysis": analysis}

    except Exception as e:
        raise e
