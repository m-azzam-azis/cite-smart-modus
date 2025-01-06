import { fetch } from "@hypermode/modus-sdk-as/assembly/http";
import { http, models } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import { SearchResult, Paper, Author, SimplifiedPaper } from "./types";
import {
  AssistantMessage,
  OpenAIChatModel,
  SystemMessage,
  UserMessage,
} from "@hypermode/modus-sdk-as/models/openai/chat";

export function sayHello(name: string | null = null): string {
  return `Hello, ${name || "World"}!`;
}

export function getMostRelevantPaperByTitle(title: string): SimplifiedPaper {
  const baseUrl: string =
    "https://api.semanticscholar.org/graph/v1/paper/search";
  const encodedTitle: string = encodeURIComponent(title);
  const fields: string = "title,authors,paperId";
  const limit: i32 = 1;
  const url: string = `${baseUrl}?query=${encodedTitle}&limit=${limit}&fields=${fields}`;

  const response = fetch(url);
  const jsonText: string = response.text(); // Synchronously get the response body as string

  // Parse JSON response
  const result: SearchResult = JSON.parse<SearchResult>(jsonText);

  if (result.data.length == 0) {
    // Return empty SimplifiedPaper object if no results found
    const emptyPaper: SimplifiedPaper = new SimplifiedPaper();
    return emptyPaper;
  }

  const paper: Paper = result.data[0];

  // Extract author names
  const authorNames: Array<string> = new Array<string>();
  for (let i: i32 = 0; i < paper.authors.length; i++) {
    const author: Author = paper.authors[i];
    authorNames.push(author.name);
  }

  // Create a simplified paper object
  const simplifiedPaper: SimplifiedPaper = new SimplifiedPaper();
  simplifiedPaper.title = paper.title;
  simplifiedPaper.id = paper.paperId;
  simplifiedPaper.authors = authorNames;

  return simplifiedPaper;
}

export function getMostRelevantPaperByKeyword(
  keyword: string,
): SimplifiedPaper {
  const baseUrl: string =
    "https://api.semanticscholar.org/graph/v1/paper/search";
  const encodedKeyword: string = encodeURIComponent(keyword);
  const fields: string = "title,authors,paperId";
  const limit: i32 = 1;
  const url: string = `${baseUrl}?query=${encodedKeyword}&limit=${limit}&fields=${fields}`;

  const response = fetch(url);
  const jsonText: string = response.text(); // Synchronously get the response body as string

  // Parse JSON response
  const result: SearchResult = JSON.parse<SearchResult>(jsonText);

  if (result.data.length == 0) {
    // Return empty SimplifiedPaper object if no results found
    const emptyPaper: SimplifiedPaper = new SimplifiedPaper();
    return emptyPaper;
  }

  const paper: Paper = result.data[0];

  // Extract author names
  const authorNames: Array<string> = new Array<string>();
  for (let i: i32 = 0; i < paper.authors.length; i++) {
    const author: Author = paper.authors[i];
    authorNames.push(author.name);
  }

  // Create a simplified paper object
  const simplifiedPaper: SimplifiedPaper = new SimplifiedPaper();
  simplifiedPaper.title = paper.title;
  simplifiedPaper.id = paper.paperId;
  simplifiedPaper.authors = authorNames;

  return simplifiedPaper;
}

export function generateTextFromDeepSeekAI(
  instruction: string,
  prompt: string,
): string {
  const model = models.getModel<OpenAIChatModel>("deepseek");
  const input = model.createInput([
    new SystemMessage(instruction),
    new UserMessage(prompt),
  ]);
  input.temperature = 0.7;
  const output = model.invoke(input);

  return output.choices[0].message.content.trim();
}

// Export all functions from other modules/files if necessary
export * from "./api-services";
