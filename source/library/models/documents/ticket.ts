type TicketType = "standalone" | "inquiry" | "report";

interface TicketFormData {
	topic: string;
}

interface TicketDocument {
	createdAt: number;
	type: TicketType;
	formData: TicketFormData;
	isResolved: boolean;
}

export type { TicketDocument, TicketType, TicketFormData };
