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
}
