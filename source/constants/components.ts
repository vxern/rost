export default Object.freeze({
	// The 'none' custom ID is special: Interactions with this code are auto-acknowledged and discarded, never to be
	// seen again. 😈
	none: "none",
	acceptedRules: "accepted_rules",
	prompts: {
		verification: "verification",
		reports: "reports",
		resources: "resources",
		suggestions: "suggestions",
		tickets: "tickets",
	},
	notices: {
		selectRoles: "select_roles",
		makeSuggestion: "make_suggestion",
		makeReport: "make_report",
		submitResource: "submit_resource",
		openTicket: "open_ticket",
	},
	createInquiry: "create_inquiry",
	openReportTicket: "open_report_ticket",
	removePrompt: "remove_prompt",
	showInChat: "show_in_chat",
	noPrompts: "no_prompts",
} as const);
