import type { ChapterType, Difficulty, Section, SectionSlug, Track } from '@/lib/schema';
import type { CheatGroup, MindNode, ParsedResource, RoadmapStep } from './markdown/parse';

type Format = 'md' | 'html';

interface ItemBase {
  track: string;
  slug: string;
  /** Path relative to the content root, with forward slashes. */
  file: string;
  title: string;
  /** YYYY-MM-DD written by the admin on save. */
  updated?: string;
  href: string;
}

export interface Chapter extends ItemBase {
  course: string;
  fileName: string;
  format: Format;
  description: string;
  tags: string[];
  type: ChapterType;
  difficulty?: Difficulty;
  companies: string[];
  topic?: string;
  /** Markdown body (md chapters only). */
  body: string;
}

export interface Course {
  track: string;
  slug: string;
  /** Folder relative to the content root. */
  folder: string;
  title: string;
  description: string;
  chapters: Chapter[];
  updated?: string;
  href: string;
}

export interface Roadmap extends ItemBase {
  steps: RoadmapStep[];
}

export interface MindMap extends ItemBase {
  format: Format;
  /** Parsed tree (md maps only). */
  root?: MindNode;
}

export interface Question extends ItemBase {
  question: string;
  difficulty: Difficulty;
  companies: string[];
  tags: string[];
  /** The answer, as markdown. */
  body: string;
}

export interface CheatSheet extends ItemBase {
  format: Format;
  description: string;
  groups: CheatGroup[];
}

export interface ResourceList extends ItemBase {
  links: ParsedResource[];
}

export interface Content {
  tracks: Track[];
  sections: Section[];
  courses: Course[];
  roadmaps: Roadmap[];
  mindMaps: MindMap[];
  questions: Question[];
  cheatSheets: CheatSheet[];
  resources: ResourceList[];
}

export interface RecentItem {
  section: SectionSlug;
  track: string;
  title: string;
  href: string;
  updated: string;
}
