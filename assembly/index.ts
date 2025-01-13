import { fetch } from "@hypermode/modus-sdk-as/assembly/http";
import { neo4j, models } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import {
  SearchResult,
  Paper,
  Author,
  SimplifiedPaper,
  PaperSearchInput,
  PaperSearchResponse,
  PaperObject,
} from "./types";
import { EmbeddingsModel } from "@hypermode/modus-sdk-as/models/experimental/embeddings";
import {
  OpenAIChatModel,
  SystemMessage,
  UserMessage,
} from "@hypermode/modus-sdk-as/models/openai/chat";

// Helper function to fetch papers from Semantic Scholar
function fetchPapers(query: string): Array<SimplifiedPaper> {
  const baseUrl: string =
    "https://api.semanticscholar.org/graph/v1/paper/search";
  const encodedQuery: string = encodeURIComponent(query);
  const fields: string = "title,authors,paperId";
  const limit: i32 = 10;
  const url: string = `${baseUrl}?query=${encodedQuery}&limit=${limit}&fields=${fields}`;

  const response = fetch(url);
  const jsonText: string = response.text(); // Synchronously get the response body as string

  // Parse JSON response
  const result: SearchResult = JSON.parse<SearchResult>(jsonText);

  const simplifiedPapers: Array<SimplifiedPaper> = new Array<SimplifiedPaper>();
  for (let i: i32 = 0; i < result.data.length; i++) {
    const paper: Paper = result.data[i];
    const authorNames: Array<string> = paper.authors.map(
      (author: Author) => author.name,
    );
    const simplifiedPaper: SimplifiedPaper = new SimplifiedPaper();
    simplifiedPaper.title = paper.title;
    simplifiedPaper.id = paper.paperId;
    simplifiedPaper.authors = authorNames;
    simplifiedPapers.push(simplifiedPaper);
  }

  return simplifiedPapers;
}

// Helper function to generate embeddings for a text
function generateEmbeddings(text: string): Array<f32> {
  const model = models.getModel<EmbeddingsModel>("minilm");
  const input = model.createInput([text]);
  const output = model.invoke(input);
  return output.predictions[0];
}

// Helper function to calculate similarity score between two embeddings
function calculateSimilarityScore(
  embedding1: Array<f32>,
  embedding2: Array<f32>,
): f32 {
  let dotProduct: f32 = 0.0;
  let norm1: f32 = 0.0;
  let norm2: f32 = 0.0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  return dotProduct / (<f32>Math.sqrt(norm1) * <f32>Math.sqrt(norm2));
}

// New feature function
export function searchAndStorePapers(
  input: PaperSearchInput,
): PaperSearchResponse {
  // Generate embeddings for the title
  const titleEmbedding: Array<f32> = generateEmbeddings(input.title);

  // Fetch papers related to title
  const titlePapers: Array<SimplifiedPaper> = fetchPapers(input.title);

  // Fetch papers related to keywords
  const keywordQuery: string = input.keywords.join(" ");
  const keywordPapers: Array<SimplifiedPaper> = fetchPapers(keywordQuery);

  // Combine results
  const allPapers: Array<SimplifiedPaper> = titlePapers.concat(keywordPapers);

  // Generate embeddings for each paper title and calculate similarity scores
  const paperEmbeddings: Array<Array<f32>> = new Array<Array<f32>>(
    allPapers.length,
  );
  for (let i = 0; i < allPapers.length; i++) {
    paperEmbeddings[i] = generateEmbeddings(allPapers[i].title);
  }

  const paperObjects: Array<PaperObject> = new Array<PaperObject>();
  const citations: Array<SimplifiedPaper> = new Array<SimplifiedPaper>();
  for (let i = 0; i < allPapers.length; i++) {
    const similarityScore: f32 = calculateSimilarityScore(
      titleEmbedding,
      paperEmbeddings[i],
    );
    if (similarityScore > 0) {
      const paperObject: PaperObject = new PaperObject(
        allPapers[i].id,
        allPapers[i].title,
        allPapers[i].authors.join(", "),
      );
      paperObjects.push(paperObject);

      const simplifiedPaper: SimplifiedPaper = new SimplifiedPaper();
      simplifiedPaper.title = allPapers[i].title;
      simplifiedPaper.id = allPapers[i].id;
      simplifiedPaper.authors = allPapers[i].authors;
      simplifiedPaper.similarityScore = similarityScore;
      citations.push(simplifiedPaper);
    }
  }

  // Sort citations by similarity score in descending order
  citations.sort((a, b) => <i32>b.similarityScore - <i32>a.similarityScore);

  // Create a node in Neo4j and add connections to the papers with similarity score
  const session = neo4j.executeQuery;
  const createNodeQuery = `
    CREATE (n:Search {title: $title, keywords: $keywords, uid: $uid, embedding: $embedding})
    WITH n
    UNWIND $papers AS paper
    MERGE (p:Paper {id: paper.id, title: paper.title, authors: paper.authors})
    MERGE (n)-[r:RELATED_TO {similarityScore: paper.similarityScore}]->(p)
  `;

  const params = new neo4j.Variables();
  params.set("title", input.title);
  params.set("keywords", input.keywords.join(", "));
  params.set("uid", input.uid);
  params.set("embedding", titleEmbedding);
  params.set("papers", citations); // Use citations to include similarityScore

  session("neo4j", createNodeQuery, params);

  // Return response
  const response: PaperSearchResponse = new PaperSearchResponse();
  response.title = input.title;
  response.citations = citations;

  return response;
}

// New endpoint to fetch all projects for a given user ID using streaming
export function getProjectsByUserId(userId: string): PaperObject[] | null {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);

  const query = `
    MATCH (p:Search {uid: $userId})
    OPTIONAL MATCH (p)-[r:RELATED_TO]->(citation:Paper)
    WITH p, COLLECT({
      id: citation.id,
      title: citation.title,
      authors: citation.authors,
      similarityScore: r.similarityScore
    }) AS citations
    RETURN COLLECT({
      id: elementId(p),
      title: p.title,
      keywords: p.keywords,
      citations: citations
    }) AS projects
  `;

  const result = neo4j.executeQuery("neo4j", query, vars);
  let projects: PaperObject[] = [];

  if (result.Records.length > 0) {
    const recordResults = result.Records[0].get("projects");
    projects = JSON.parse<PaperObject[]>(recordResults);
  }

  return projects;
}

// Function to search for a specific project by its ID
export function getProjectById(projectId: string): PaperObject | null {
  const vars = new neo4j.Variables();
  vars.set("projectId", projectId);

  const query = `
    MATCH (p:Search {projectId: $projectId})
    RETURN {
      id: elementId(p),
      title: p.title,
      keywords: p.keywords
    } AS project
  `;

  const result = neo4j.executeQuery("neo4j", query, vars);

  if (result.Records.length > 0) {
    const recordResults = result.Records[0].get("project");
    const project = JSON.parse<PaperObject>(recordResults);
    return project;
  }

  return null;
}

// New endpoint to delete a citation for a given user ID and project ID
export function deleteCitation(
  userId: string,
  projectId: string,
  citationId: string,
): string | null {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("projectId", projectId);
  vars.set("citationId", citationId);

  const query = `
    MATCH (p:Search {uid: $userId})-[r:RELATED_TO]->(c:Paper {id: $citationId})
    WHERE elementId(p) = $projectId
    DELETE r
    RETURN c
  `;

  const result = neo4j.executeQuery("neo4j", query, vars);

  if (result.Records.length > 0) {
    const deletedCitation = result.Records[0].get("c");
    return JSON.stringify(deletedCitation);
  }

  return null;
}

// New endpoint to delete a whole project for a given user ID and project ID
export function deleteProject(
  userId: string,
  projectId: string,
): string | null {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("projectId", projectId);

  const query = `
    MATCH (p:Search {uid: $userId})
    WHERE elementId(p) = $projectId
    DETACH DELETE p
    RETURN p
  `;

  const result = neo4j.executeQuery("neo4j", query, vars);

  if (result.Records.length > 0) {
    const deletedProject = result.Records[0].get("p");
    return JSON.stringify(deletedProject);
  }

  return null;
}

// New endpoint to interact with DeepSeek chatbot for citation-related queries
export function citationChatbot(
  userId: string,
  prompt: string,
  projectId: string | null = null,
): string {
  let projectDetails = "";

  if (projectId) {
    const vars = new neo4j.Variables();
    vars.set("userId", userId);
    vars.set("projectId", projectId);

    const query = `
      MATCH (p:Search {uid: $userId})
      WHERE elementId(p) = $projectId
      OPTIONAL MATCH (p)-[r:RELATED_TO]->(citation:Paper)
      WITH p, COLLECT({
        id: citation.id,
        title: citation.title,
        authors: citation.authors,
        similarityScore: r.similarityScore
      }) AS citations
      RETURN {
        id: elementId(p),
        title: p.title,
        keywords: p.keywords,
        citations: citations
      } AS project
    `;

    const result = neo4j.executeQuery("neo4j", query, vars);

    if (result.Records.length > 0) {
      const project = result.Records[0].get("project");
      projectDetails = `Project Details: ${JSON.stringify(project)}`;
    }
  }

  const systemInstruction = `You are Cite Smart, an AI companion designed to assist users in answering questions about academic citations, papers, and their associated contexts. Your primary goal is to provide accurate, context-aware responses based on the user's input, leveraging available citation data.

${projectDetails}

REQUIREMENTS:
1. Respond only to questions directly related to academic citations, papers, and their context.
2. Politely decline to answer if the query strays off-topic, with a response such as: 
   "I’m here to assist with academic citations and related questions. Let me know if you need help with that!"
3. Ensure responses are factual, concise, and relevant to the user’s query.
4. Clarify or expand upon citation-related topics such as:
   - Citation relationships (e.g., which papers cite or are cited by others).
   - Authors, publication years, and research topics of cited works.
   - Summarizing key points or findings of academic papers.
5. Provide step-by-step guidance for citation-related tasks when requested (e.g., how to format a citation in APA style).

RESPONSE GUIDELINES:
- Use a professional yet conversational tone.
- Include links or references when available to enrich the response.
- Avoid overly technical jargon unless the user specifies expertise.
- When context or citation data is insufficient, politely inform the user (e.g., "I couldn’t find enough data on this citation. Could you provide more details?").

EXAMPLES OF ON-TOPIC QUESTIONS:
- "What are the key findings of the paper titled 'Advances in AI Citation Networks'?"
- "Which papers have cited the work by John Doe published in 2021?"
- "Can you explain how to format a citation in APA style for this article?"
- "What are the top papers related to deep learning and natural language processing?"

EXAMPLES OF OFF-TOPIC QUESTIONS:
- "What’s the weather like today?"
  Response: "I’m here to assist with academic citations and related questions. Let me know if you need help with that!"
- "Who won the World Cup in 2022?"
  Response: "I’m here to assist with academic citations and related questions. Let me know if you need help with that!"

IMPORTANT:
- Stay strictly within the domain of citations and academic papers.
- Do not attempt to answer non-citation-related queries, regardless of user insistence.
- Ensure answers are clear, precise, and enriched with citation-specific insights.
- Never make assumptions about user intentions outside the academic citation context.
- Avoid speculation; only provide answers based on available data or plausible research-related context.`;

  const model = models.getModel<OpenAIChatModel>("deepseek");
  const input = model.createInput([
    new SystemMessage(systemInstruction),
    new UserMessage(prompt),
  ]);
  input.temperature = 0.7;
  const output = model.invoke(input);

  return output.choices[0].message.content.trim();
}
