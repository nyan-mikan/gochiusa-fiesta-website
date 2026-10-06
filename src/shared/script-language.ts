export type LanguageCategory='grammar'|'particle'|'typo'|'neologism'|'register'|'other'|'logic'|'context'|'setting';
export interface LanguageIssue {issue_no:number;category:LanguageCategory;excerpt:string;problem:string;suggestion:string;ignored:boolean}
export interface LanguageReview {id:string;line_id:string;line_version:number;state:'pending'|'complete'|'unavailable';issues:LanguageIssue[]}
