export type Feed = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  include_keywords: string[];
  exclude_keywords: string[];
  priority_keywords: string[];
  min_semantic_similarity: number;
  min_publication_year: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FeedInput = {
  name: string;
  description: string;
  include_keywords?: string;
  exclude_keywords?: string;
  priority_keywords?: string;
  min_semantic_similarity?: number;
  min_publication_year?: number;
};

export type AppSettings = {
  user_id: string;
  recommender_mode: "training" | "stable";
  schedule_enabled: boolean;
  exploration_rate: number;
  training_batch_size: number;
  max_feed_recommendations: number;
  max_today_recommendations: number;
  updated_at: string;
};

export type Paper = {
  id: string;
  title: string;
  abstract: string | null;
  authors: Array<{ name?: string; display_name?: string }> | string[];
  venue: string | null;
  publication_year: number | null;
  canonical_url: string | null;
  in_zotero?: boolean;
};

export type Recommendation = {
  id: string;
  paper_id: string;
  feed_id: string;
  final_score: number;
  reason_text: string;
  components: Record<string, number>;
  created_at: string;
  paper: Paper;
  feed?: Pick<Feed, "id" | "name"> | null;
  feedLabels?: string[];
  state?: import("./workflow").PaperState;
};
