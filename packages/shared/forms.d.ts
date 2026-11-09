export type InputMask = 'money' | 'document' | 'phone' | 'postalCode' | 'integer' | 'contact';
export function digits(value: unknown, max?: number): string;
export function formatPostalCode(value: string): string;
export function formatDocument(value: string): string;
export function formatPhone(value: string): string;
export function formatMoneyInput(value: string): string;
export function centsInput(value: number): string;
export function moneyToCents(value: string, max?: number): number;
export function maskInput(value: string, kind?: InputMask): string;
