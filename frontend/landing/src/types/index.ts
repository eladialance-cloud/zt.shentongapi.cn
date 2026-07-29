export interface LandingContent {
  id: string;
  section: string;
  data: Record<string, unknown>;
  sortOrder: number;
}

export interface CheckUpdateResult {
  hasUpdate: boolean;
  latestVersion: string | null;
  forceUpdate: boolean;
  grayscaleHit: boolean;
  downloadUrl: string | null;
  changelog: string | null;
}

export interface ApiResponse<T> {
  code: number;
  success: boolean;
  data: T;
  message?: string;
}

export interface NavItem {
  id: string;
  label: string;
}

export interface HeroStats {
  value: string;
  label: string;
}

export interface FeatureCard {
  name: string;
  role: string;
  desc: string;
  features: string[];
}

export interface OrgCard {
  name: string;
  role: string;
  tags: string[];
}

export interface ProcessStep {
  num: string;
  title: string;
  en: string;
  roles: string;
}

export interface DataflowCard {
  from: string;
  to: string;
  label: string;
}

export interface InfraCard {
  name: string;
  desc: string;
}

export interface TechCard {
  num: string;
  name: string;
  role: string;
  features: string[];
}

export interface IndustryCard {
  emoji: string;
  name: string;
  en: string;
}
