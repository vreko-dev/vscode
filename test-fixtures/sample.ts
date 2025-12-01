// Sample TypeScript file for testing
export function calculateTotal(price: number, tax: number): number {
	return price + price * tax;
}

export function formatCurrency(amount: number): string {
	return `$${amount.toFixed(2)}`;
}
