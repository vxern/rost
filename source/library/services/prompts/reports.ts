import { trim } from "rost:constants/formatting";
import type { Client } from "rost/client";
import { InteractionCollector } from "rost/collectors";
import type { Report } from "rost/models/report";
import { User } from "rost/models/user";
import { PromptService } from "rost/services/prompts/service";

class ReportPromptService extends PromptService<{
	type: "reports";
	model: Report;
	metadata: [partialId: string, isResolve: string];
}> {
	readonly #openTicket: InteractionCollector<[partialId: string]>;

	constructor(client: Client, { guildId }: { guildId: bigint }) {
		super(client, { identifier: "ReportPromptService", guildId }, { type: "reports", deleteMode: "delete" });

		this.#openTicket = new InteractionCollector(client, {
			guildId,
			customId: InteractionCollector.encodeCustomId([constants.components.openReportTicket]),
			isPermanent: true,
		});
	}

	async start(): Promise<void> {
		this.#openTicket.onInteraction(async (buttonPress) => {
			await this.#handleOpenTicket(buttonPress, buttonPress.metadata[1]);
		});

		await this.client.registerInteractionCollector(this.#openTicket);

		await super.start();
	}

	async stop(): Promise<void> {
		this.#openTicket.close();

		await super.stop();
	}

	getAllDocuments(): Map<string, Report> {
		const reports = new Map<string, Report>();

		for (const [partialId, reportDocument] of this.client.documents.reports) {
			if (reportDocument.guildId !== this.guildIdString) {
				continue;
			}

			reports.set(partialId, reportDocument);
		}

		return reports;
	}

	async getUserDocument(reportDocument: Report): Promise<User> {
		return User.getOrCreate(this.client, { userId: reportDocument.authorId });
	}

	getPromptContent(user: Rost.User, reportDocument: Report): Discord.CreateMessageOptions | undefined {
		const strings = constants.contexts.reportPrompt({
			localise: this.client.localise,
			locale: this.guildLocale,
		});
		return {
			embeds: [
				{
					color: reportDocument.isResolved ? constants.colours.green : constants.colours.peach,
					thumbnail: (() => {
						const iconURL = Discord.avatarUrl(user.id, user.discriminator, {
							avatar: user.avatar,
							size: 128,
							format: "webp",
						});
						if (iconURL === undefined) {
							return;
						}

						return { url: iconURL };
					})(),
					fields: [
						{
							name: this.client.diagnostics.user(user),
							value: reportDocument.formData.reason,
							inline: false,
						},
						{
							name: strings.report.users,
							value: reportDocument.formData.users,
							inline: true,
						},
						{
							name: strings.report.link,
							value: reportDocument.formData.messageLink ?? `*${strings.report.noLinkProvided}*`,
							inline: true,
						},
					],
					footer: {
						text: this.guild.name,
						iconUrl: PromptService.encodeMetadataInGuildIcon({
							guild: this.guild,
							partialId: reportDocument.partialId,
						}),
					},
				},
			],
			components: [
				{
					type: Discord.MessageComponentTypes.ActionRow,
					components: reportDocument.isResolved
						? [
								{
									type: Discord.MessageComponentTypes.Button,
									style: Discord.ButtonStyles.Success,
									label: strings.markUnresolved,
									customId: this.magicButton.encodeId([reportDocument.partialId, `${false}`]),
								},

								{
									type: Discord.MessageComponentTypes.Button,
									style: Discord.ButtonStyles.Danger,
									label: strings.close,
									customId: this.removeButton.encodeId([reportDocument.partialId]),
								},
							]
						: [
								{
									type: Discord.MessageComponentTypes.Button,
									style: Discord.ButtonStyles.Primary,
									label: strings.markResolved,
									customId: this.magicButton.encodeId([reportDocument.partialId, `${true}`]),
								},
								...((reportDocument.ticketChannelId === undefined
									? [
											{
												type: Discord.MessageComponentTypes.Button,
												style: Discord.ButtonStyles.Secondary,
												label: strings.openTicket,
												customId: this.#openTicket.encodeId([reportDocument.partialId]),
											},
										]
									: []) as Discord.ButtonComponent[]),
							],
				},
			],
		};
	}

	getNoPromptsMessageContent(): Discord.CreateMessageOptions {
		const strings = constants.contexts.noReports({
			localise: this.client.localise,
			locale: this.guildLocale,
		});

		return {
			embeds: [
				{
					title: strings.title,
					description: strings.description,
					color: constants.colours.success,
					footer: {
						text: this.guild.name,
						iconUrl: PromptService.encodeMetadataInGuildIcon({
							guild: this.guild,
							partialId: constants.components.noPrompts,
						}),
					},
				},
			],
		};
	}

	async handlePromptInteraction(
		interaction: Rost.Interaction<[partialId: string, isResolve: string]>,
	): Promise<Report | null | undefined> {
		const reportDocument = this.documents.get(interaction.metadata[1]);
		if (reportDocument === undefined) {
			return undefined;
		}

		const isResolved = interaction.metadata[2] === "true";
		if (isResolved && reportDocument.isResolved) {
			const strings = constants.contexts.alreadyMarkedResolved({
				localise: this.client.localise,
				locale: interaction.locale,
			});
			this.client
				.warning(interaction, {
					title: strings.title,
					description: strings.description,
				})
				.ignore();

			return;
		}

		if (!(isResolved || reportDocument.isResolved)) {
			const strings = constants.contexts.alreadyMarkedUnresolved({
				localise: this.client.localise,
				locale: interaction.locale,
			});
			this.client
				.warning(interaction, {
					title: strings.title,
					description: strings.description,
				})
				.ignore();

			return;
		}

		await reportDocument.update(this.client, () => {
			reportDocument.isResolved = isResolved;
		});

		return reportDocument;
	}

	async #handleOpenTicket(interaction: Rost.Interaction, partialId: string): Promise<void> {
		await this.client.postponeReply(interaction);

		const reportDocument = this.documents.get(partialId);
		if (reportDocument === undefined) {
			return;
		}

		if (reportDocument.ticketChannelId !== undefined) {
			const ticketChannel = await this.client.bot.helpers
				.getChannel(reportDocument.ticketChannelId)
				.catch(() => undefined);
			if (ticketChannel !== undefined) {
				const strings = constants.contexts.reportTicketAlreadyOpen({
					localise: this.client.localise,
					locale: interaction.locale,
				});
				this.client.warned(interaction, { title: strings.title, description: strings.description }).ignore();

				return;
			}

			await reportDocument.update(this.client, () => {
				reportDocument.ticketChannelId = undefined;
			});
		}

		const reportAuthor = this.client.entities.users.get(BigInt(reportDocument.authorId));
		if (reportAuthor === undefined) {
			this.#replyTicketFailed(interaction);
			return;
		}

		const strings = {
			...constants.contexts.reportTicket({
				localise: this.client.localise,
				locale: this.guildLocale,
			}),
			...constants.contexts.reportPrompt({
				localise: this.client.localise,
				locale: this.guildLocale,
			}),
		};
		const ticketDocument = await this.client.services.local("ticketPrompts", { guildId: this.guildId }).openTicket({
			type: "report",
			formData: { topic: trim(strings.topic({ users: reportDocument.formData.users }), 1024) },
			user: reportAuthor,
		});
		if (ticketDocument === undefined) {
			this.#replyTicketFailed(interaction);
			return;
		}

		await this.client.bot.helpers
			.sendMessage(ticketDocument.channelId, {
				embeds: [
					{
						title: strings.details,
						color: constants.colours.peach,
						fields: [
							{
								name: strings.report.reason,
								value: reportDocument.formData.reason,
								inline: false,
							},
							{
								name: strings.report.users,
								value: reportDocument.formData.users,
								inline: true,
							},
							{
								name: strings.report.link,
								value: reportDocument.formData.messageLink ?? `*${strings.report.noLinkProvided}*`,
								inline: true,
							},
						],
					},
				],
			})
			.catch((error) => this.log.warn(error, "Failed to send report details in the ticket channel."));

		await reportDocument.update(this.client, () => {
			reportDocument.ticketChannelId = ticketDocument.channelId;
		});

		// Deleting the prompt causes it to be re-sent, reflecting the new state (no 'open ticket' button).
		const prompt = this.promptByPartialId.get(reportDocument.partialId);
		if (prompt !== undefined) {
			await this.client.bot.helpers
				.deleteMessage(prompt.channelId, prompt.id)
				.catch((error) => this.log.warn(error, "Failed to delete prompt."));
		}

		{
			const strings = constants.contexts.reportTicketOpened({
				localise: this.client.localise,
				locale: interaction.locale,
			});
			this.client.succeeded(interaction, { title: strings.title, description: strings.description }).ignore();
		}
	}

	#replyTicketFailed(interaction: Rost.Interaction): void {
		const strings = constants.contexts.reportTicketFailed({
			localise: this.client.localise,
			locale: interaction.locale,
		});
		this.client.failed(interaction, { title: strings.title, description: strings.description }).ignore();
	}
}

export { ReportPromptService };
