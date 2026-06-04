import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

model = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed")

print("Loading the PDF document...")
#add your pdf
loader = PyPDFLoader("Your_file.pdf")
docs = loader.load()

text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
all_splits = text_splitter.split_documents(docs)

print("Building embeddings...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
vector_store = InMemoryVectorStore.from_documents(all_splits, embeddings)

def retrieve_context(query: str) -> str:
    similar_docs = vector_store.similarity_search(query, k=3)
    data = [] 
    for doc in similar_docs:
        content = doc.page_content
        source = doc.metadata.get("source", "unknown")
        data.append(f"Content: {content}\nSource: {source}")
    return "\n\n".join(data)

# Prompt template with chat history support
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. Answer the user's question using only the provided context."),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "<context>\n{context}\n</context>\n\nQuestion: {question}")
])

# Simple chain: prompt -> model -> parse output
chain = prompt | model | StrOutputParser()

chat_history = []
MAX_HISTORY_LEN=6

print("Welcome to RAG Chatbot. Enter your query below.")
while True:
    query = input("\nYou : ").strip()
    if query.lower() in ["exit", "quit", "bye", "goodbye"]:
        print("AI : Good Bye!")
        break
    if not query:
        continue

    #Retrieve relevant context
    context = retrieve_context(query)

    active_history=chat_history[-MAX_HISTORY_LEN:]

    #Run the chain with context + history + question
    response = chain.invoke({
        "context": context,
        "chat_history": active_history,
        "question": query
    })

    print(f"\nAI: {response}")

    #Update chat history
    chat_history.append(HumanMessage(content=query))
    chat_history.append(AIMessage(content=response))