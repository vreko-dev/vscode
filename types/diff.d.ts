// biome-ignore lint/suspicious/noExplicitAny: Third-party type definitions for 'diff' library
declare module "diff" {
	export function diffChars(oldStr: string, newStr: string): any[];
	export function diffWords(oldStr: string, newStr: string): any[];
	export function diffWordsWithSpace(oldStr: string, newStr: string): any[];
	export function diffLines(oldStr: string, newStr: string): any[];
	export function diffTrimmedLines(oldStr: string, newStr: string): any[];
	export function diffSentences(oldStr: string, newStr: string): any[];
	export function diffCss(oldStr: string, newStr: string): any[];
	export function diffJson(oldObj: any, newObj: any): any[];
	export function createTwoFilesPatch(
		oldFileName: string,
		newFileName: string,
		oldStr: string,
		newStr: string,
		oldHeader?: string,
		newHeader?: string,
		options?: any,
	): string;
	export function createPatch(
		fileName: string,
		oldStr: string,
		newStr: string,
		oldHeader?: string,
		newHeader?: string,
		options?: any,
	): string;
	export function applyPatch(
		oldStr: string,
		uniDiff: string,
		options?: any,
	): string;
	export function applyPatches(uniDiff: string, options?: any): void;
	export function parsePatch(diffStr: string, options?: any): any[];
	export function convertChangesToDMP(changes: any[]): any[];
	export function convertChangesToXML(changes: any[]): string;
	export function canonicalize(
		obj: any,
		stack: any[],
		replacementStack: any[],
	): any;
}
