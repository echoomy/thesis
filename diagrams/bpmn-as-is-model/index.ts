import {
	applyAutoLayout,
	Bpmn,
	checkDiCompleteness,
	exportSvg,
	lintDiagram,
} from "@bpmnkit/core";

const definitions = Bpmn.createProcess("Process_AsIs")
	.name("Внесение изменений в действующую информационную систему — AS-IS")
	.executable(false)
	.startEvent("Event_FeedbackReceived", {
		name: "Получена обратная связь по системе",
		messageName: "Функциональная проблема или дефект",
	})
	.userTask("Task_AnalyzeRisks", {
		name: "Проанализировать риски и ограничения",
	})
	.exclusiveGateway("Gateway_ImplementationPossible", {
		name: "Реализация согласована?",
	})
	.branch("implementation-approved", (branch) =>
		branch.label("Да").condition("= implementationApproved").connectTo("Task_PrepareSpecification"),
	)
	.branch("implementation-rejected", (branch) =>
		branch.label("Нет").defaultFlow().endEvent("Event_ChangeNotApproved", {
			name: "Изменение не согласовано",
		}),
	)
	.userTask("Task_PrepareSpecification", {
		name: "Сформировать техническое задание",
	})
	.userTask("Task_CreateTrackerIssue", {
		name: "Создать задачу в корпоративном трекере",
	})
	.userTask("Task_AssignDevelopers", {
		name: "Назначить ответственных разработчиков",
	})
	.exclusiveGateway("Gateway_DevelopmentEntry")
	.userTask("Task_ImplementChanges", {
		name: "Внести изменения в компоненты системы",
	})
	.userTask("Task_PushTemporaryBranch", {
		name: "Отправить изменения во временную ветку",
	})
	.userTask("Task_ReviewCode", {
		name: "Проверить исходный код",
	})
	.exclusiveGateway("Gateway_CodeApproved", {
		name: "Код соответствует требованиям?",
	})
	.branch("code-approved", (branch) =>
		branch.label("Да").condition("= codeApproved").connectTo("Task_BuildTestVersion"),
	)
	.branch("code-rework", (branch) =>
		branch.label("Нет").defaultFlow().connectTo("Gateway_DevelopmentEntry"),
	)
	.manualTask("Task_BuildTestVersion", {
		name: "Собрать изменённые веб-сервисы",
	})
	.manualTask("Task_DeployTestVersion", {
		name: "Развернуть веб-сервисы в тестовой среде",
	})
	.userTask("Task_TestChanges", {
		name: "Проверить функционал и совместимость",
		documentation:
			"Выделенный этап тестирования из описания AS-IS. Отдельная роль тестировщика не указана; проверка отнесена к зоне ответственности руководителя команды.",
	})
	.exclusiveGateway("Gateway_TestsPassed", {
		name: "Тестирование пройдено?",
	})
	.branch("tests-passed", (branch) =>
		branch.label("Да").condition("= testsPassed").connectTo("Task_MergeMainBranch"),
	)
	.branch("test-rework", (branch) =>
		branch.label("Нет").defaultFlow().connectTo("Gateway_DevelopmentEntry"),
	)
	.userTask("Task_MergeMainBranch", {
		name: "Слить изменения в основную ветку",
	})
	.manualTask("Task_BuildStagingVersion", {
		name: "Повторно собрать веб-сервисы",
	})
	.manualTask("Task_DeployStagingVersion", {
		name: "Развернуть веб-сервисы в пре-продакшене",
	})
	.userTask("Task_CustomerAcceptance", {
		name: "Протестировать и согласовать изменения",
	})
	.exclusiveGateway("Gateway_CustomerApproved", {
		name: "Все требования заказчика выполнены?",
	})
	.branch("customer-approved", (branch) =>
		branch.label("Да").condition("= customerApproved").connectTo("Task_BuildProductionVersion"),
	)
	.branch("customer-rework", (branch) =>
		branch.label("Нет").defaultFlow().connectTo("Gateway_DevelopmentEntry"),
	)
	.manualTask("Task_BuildProductionVersion", {
		name: "Собрать согласованную версию системы",
	})
	.manualTask("Task_DeployProductionVersion", {
		name: "Выпустить систему в продакшен",
	})
	.endEvent("Event_ChangesReleased", {
		name: "Изменения доступны пользователям",
	})
	.build({ explicitJoins: true });

const process = definitions.processes[0]!;
process.laneSet = {
	id: "LaneSet_AsIs",
	lanes: [
		{
			id: "Lane_TeamLead",
			name: "Руководитель команды",
			flowNodeRefs: [
				"Event_FeedbackReceived",
				"Task_AnalyzeRisks",
				"Gateway_ImplementationPossible",
				"Event_ChangeNotApproved",
				"Task_PrepareSpecification",
				"Task_CreateTrackerIssue",
				"Task_AssignDevelopers",
				"Task_ReviewCode",
				"Gateway_CodeApproved",
				"Task_TestChanges",
				"Gateway_TestsPassed",
				"Task_MergeMainBranch",
			],
			unknownAttributes: {},
		},
		{
			id: "Lane_Developer",
			name: "Разработчик",
			flowNodeRefs: [
				"Gateway_DevelopmentEntry",
				"Task_ImplementChanges",
				"Task_PushTemporaryBranch",
			],
			unknownAttributes: {},
		},
		{
			id: "Lane_SystemAdministrator",
			name: "Системный администратор",
			flowNodeRefs: [
				"Task_BuildTestVersion",
				"Task_DeployTestVersion",
				"Task_BuildStagingVersion",
				"Task_DeployStagingVersion",
				"Task_BuildProductionVersion",
				"Task_DeployProductionVersion",
				"Event_ChangesReleased",
			],
			unknownAttributes: {},
		},
		{
			id: "Lane_Customer",
			name: "Заказчик",
			flowNodeRefs: ["Task_CustomerAcceptance", "Gateway_CustomerApproved"],
			unknownAttributes: {},
		},
	],
};

definitions.collaborations = [
	{
		id: "Collaboration_AsIs",
		participants: [
			{
				id: "Participant_AsIs",
				name: "Внесение изменений в действующую ИС — AS-IS",
				processRef: process.id,
				unknownAttributes: {},
			},
		],
		messageFlows: [],
		textAnnotations: [],
		associations: [],
		groups: [],
		extensionElements: [],
		unknownAttributes: {},
	},
];

delete definitions.unknownAttributes["modeler:executionPlatform"];
delete definitions.unknownAttributes["modeler:executionPlatformVersion"];

const diagram = applyAutoLayout(definitions);

const plane = diagram.diagrams[0]!.plane;
const pool = plane.shapes.find((shape) => shape.bpmnElement === "Participant_AsIs")!;
const laneIds = new Set(process.laneSet.lanes.map((lane) => lane.id));

const bottomLane = plane.shapes
	.filter((shape) => laneIds.has(shape.bpmnElement))
	.toSorted((a, b) => a.bounds.y + a.bounds.height - b.bounds.y - b.bounds.height)
	.at(-1)!;

const lowestFlowY = Math.max(...plane.edges.flatMap((edge) => edge.waypoints.map((point) => point.y)));

const bottomPadding = 32;
const extraHeight = Math.max(0, lowestFlowY + bottomPadding - (bottomLane.bounds.y + bottomLane.bounds.height));

bottomLane.bounds.height += extraHeight;
pool.bounds.height += extraHeight;

const completeness = checkDiCompleteness(diagram);
if (completeness.missingShapes.length || completeness.missingEdges.length) {
	throw new Error(`Неполная диаграмма: ${JSON.stringify(completeness)}`);
}

const report = lintDiagram(diagram, { categories: ["flow"] });
if (report.counts.error) {
	throw new Error(`Ошибки BPMN: ${JSON.stringify(report.diagnostics)}`);
}

const svg = exportSvg(diagram).replaceAll("#f8f9fa", "#ffffff");
await Bun.write(new URL("./as-is.bpmn", import.meta.url), Bpmn.export(diagram));
await Bun.write(new URL("./as-is.svg", import.meta.url), svg);

console.log("Созданы `as-is.bpmn` и `as-is.svg` в `./diagrams/bpmn-as-is-model/`");
