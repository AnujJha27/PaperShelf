import type { Feed, FeedInput } from "@paper-radar/shared";

export const starterFeeds: FeedInput[] = [
  {
    name: "Theorem Proving & Lean",
    description: "Lean, proof assistants, and interactive theorem proving",
    include_keywords: "theorem proving, automated theorem proving, interactive theorem proving, formal proof, proof assistant, Lean, Lean 4, mathlib, dependent type theory, type theory, Coq, Isabelle, Agda",
    exclude_keywords: "tutorial, beginner, education",
    priority_keywords: "Lean, Lean 4, mathlib, theorem proving, proof assistant",
    min_semantic_similarity: 0.35,
  },
  {
    name: "Automated Reasoning & Proof Search",
    description: "Algorithms for discovering proofs and solving logical problems",
    include_keywords: "proof search, premise selection, automated reasoning, proof synthesis, proof planning, SAT, SMT, first-order logic, higher-order logic, resolution, symbolic reasoning",
    exclude_keywords: "opinion, survey-only",
    priority_keywords: "proof search, premise selection, proof synthesis, automated reasoning",
    min_semantic_similarity: 0.4,
  },
  {
    name: "Formal Methods & Verification",
    description: "Program verification, model checking, and software correctness",
    include_keywords: "formal methods, formal verification, program verification, model checking, static analysis, refinement types, Hoare logic, temporal logic, TLA+, software correctness",
    exclude_keywords: "tutorial, introductory, education",
    priority_keywords: "formal verification, program verification, model checking, software correctness",
    min_semantic_similarity: 0.4,
  },
  {
    name: "AI for Mathematics & Proofs",
    description: "Machine learning and language models for mathematical reasoning",
    include_keywords: "neural theorem proving, LLM theorem proving, mathematical reasoning, proof generation, proof synthesis, large language models, language models, AI for mathematics, machine learning for code",
    exclude_keywords: "computer vision, image classification, speech recognition, robotics",
    priority_keywords: "neural theorem proving, proof generation, Lean, mathematical reasoning",
    min_semantic_similarity: 0.45,
  },
  {
    name: "Type Theory & Programming Languages",
    description: "Type systems, semantics, and foundations of programming languages",
    include_keywords: "programming languages, type theory, dependent types, lambda calculus, operational semantics, denotational semantics, compiler verification, type systems, proof theory",
    exclude_keywords: "web development, database systems, networking",
    priority_keywords: "dependent types, type systems, lambda calculus, semantics",
    min_semantic_similarity: 0.4,
  },
  {
    name: "Frontier ML & LLMs",
    description: "Cutting-edge machine learning research covering foundation models, large language models, reasoning systems, multimodal models, AI agents, generative modeling, reinforcement learning, robotics, and emerging training methods.",
    include_keywords: "foundation models, large language models, LLMs, generative AI, generative models, transformer, attention, scaling laws, pretraining, post-training, instruction tuning, RLHF, reinforcement learning, reasoning models, test-time compute, AI agents, agentic AI, tool use, multimodal learning, vision-language models, world models, diffusion models, flow matching, representation learning, self-supervised learning, synthetic data, embodied AI, robotics learning, machine learning systems",
    exclude_keywords: "medical diagnosis, finance, marketing, education",
    priority_keywords: "foundation models, scaling laws, reasoning models, AI agents",
    min_semantic_similarity: 0.45,
  },
  {
    name: "Multimodal & Agentic ML",
    description: "Models that perceive, reason, and act across modalities and tools",
    include_keywords: "multimodal learning, vision-language models, vision-language-action, embodied AI, tool use, agentic AI, computer use, long-context models, world models, robotics learning",
    exclude_keywords: "medical imaging, autonomous driving, surveillance",
    priority_keywords: "multimodal learning, tool use, agentic AI, world models",
    min_semantic_similarity: 0.45,
  },
  {
    name: "Generative Models & Representation Learning",
    description: "Generative modeling, self-supervised learning, and learned representations",
    include_keywords: "generative models, diffusion models, flow matching, self-supervised learning, representation learning, contrastive learning, energy-based models, variational inference, synthetic data, generative modeling",
    exclude_keywords: "image editing, marketing, advertising",
    priority_keywords: "diffusion models, flow matching, representation learning, self-supervised learning",
    min_semantic_similarity: 0.45,
  },
];

export function uncreatedStarterFeeds(feeds: Pick<Feed, "name">[]) {
  const existing = new Set(feeds.map((feed) => feed.name.trim().toLowerCase()));
  return starterFeeds.filter((feed) => !existing.has(feed.name.trim().toLowerCase()));
}
