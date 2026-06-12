import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_core.tools import tool 
from langchain.agents import create_agent 

load_dotenv()

model = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed")

print("Loading the PDF document..")
#add your pdf
loader = PyPDFLoader("Your_file.pdf")
docs = loader.load()

text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
all_splits = text_splitter.split_documents(docs)

print("Building embeddings...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
vector_store = InMemoryVectorStore.from_documents(all_splits, embeddings)

@tool
def retrieve_context(query: str)->str:
    """Retrieves relevant context from the PDF document based on the query."""
    similar_docs = vector_store.similarity_search(query, k=3)
    data = []
    for doc in similar_docs:
        content = doc.page_content
        source = doc.metadata.get("source", "unknown")
        data.append(f"Content: {content}\nSource: {source}")
    return "\n\n".join(data)

tools = [retrieve_context]
client = "You are an agent who retrieves context from PDF docs."
agent = create_agent(model, tools, system_prompt=client)

chat_history = []

print("Welcome to RAG chatbot.Enter your query below.")
while True:
    query=input("\nYou : ").strip()
    if query.lower() in ["exit", "quit", "bye","goodbye"]:
        print("AI : Good Bye!")
        break
    if not query:
        continue

    chat_history.append({"role": "user", "content": query})
    
    response = agent.invoke({"messages": chat_history})

    ai_message = response["messages"][-1]
    ai_message.pretty_print()

    chat_history.append({"role": "assistant", "content": ai_message.content})