import { JSON } from "json-as";

/**
 * Represents an author of a paper.
 */
@json
export class Author {
  authorId: string = "";
  name: string = "";
}

/**
 * Represents a paper fetched from Semantic Scholar.
 */
@json
export class Paper {
  paperId: string = "";
  title: string = "";
  url: string = "";
  abstractP: string = "";
  year: i32 = 0;
  authors: Array<Author> = new Array<Author>();
}

/**
 * Represents the search result returned by Semantic Scholar API.
 */
@json
export class SearchResult {
  total: i32 = 0;
  offset: i32 = 0;
  next: i32 = 0;
  data: Array<Paper> = new Array<Paper>();
}

/**
 * Represents a simplified paper structure for JSON response.
 */
@json
export class SimplifiedPaper {
  title: string = "";
  id: string = "";
  authors: Array<string> = new Array<string>();
  similarityScore: f32 = 0.0;
}

/**
 * Represents the input for the new feature.
 */
@json
export class PaperSearchInput {
  uid: string = "";
  title: string = "";
  keywords: Array<string> = new Array<string>();
}

/**
 * Represents the response for the new feature.
 */
@json
export class PaperSearchResponse {
  title: string = "";
  citations: Array<SimplifiedPaper> = new Array<SimplifiedPaper>();
  similarityScore: f32 = 0.0;
}

/**
 * Define a type for the paper objects to be used in Neo4j
 */
@json
export class PaperObject {
  id: string;
  title: string;
  authors: string;
  citations: Array<SimplifiedPaper>; // Add this line

  constructor(id: string, title: string, authors: string) {
    this.id = id;
    this.title = title;
    this.authors = authors;
    this.citations = new Array<SimplifiedPaper>(); // Initialize citations
  }
}

