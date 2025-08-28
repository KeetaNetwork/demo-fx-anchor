export function validPeriodToDate(validUntil?: string): Date {
	const now = new Date();
	switch (validUntil) {
		default:
		case "1year":
			return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		case "6months":
			return new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
		case "3months":
			return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
		case "1month":
			return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
		case "1week":
			return new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
		case "1day":
			return new Date(now.getTime() + 1000 * 60 * 60 * 24);
		case "1hour":
			return new Date(now.getTime() + 1000 * 60 * 60);
	}
}
