interface ReportFormData {
	reason: string;
	users: string;
	messageLink: string;
}

interface ReportDocument {
	formData: ReportFormData;
	isResolved: boolean;
	ticketChannelId?: string;
}

export type { ReportDocument, ReportFormData };
