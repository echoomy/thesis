import {
	applyAutoLayout,
	Bpmn,
	checkDiCompleteness,
	exportSvg,
	lintDiagram,
} from "@bpmnkit/core";
import sharp from "sharp";

const definitions = Bpmn.createProcess("Process_ToBe")
	.name("Внесение изменений в действующую информационную систему — TO-BE")
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
	.serviceTask("Task_BuildAndDeployTestVersion", {
		name: "Собрать и развернуть тестовый экземпляр",
		taskType: "build-and-deploy-test",
		documentation:
			"Запускается автоматически при отправке изменений во временную ветку. Если сборка не завершена успешно, развёртывание не выполняется.",
	})
	.exclusiveGateway("Gateway_TestEnvironmentReady", {
		name: "Сборка и развёртывание успешны?",
	})
	.branch("test-environment-ready", (branch) =>
		branch.label("Да").condition("= testEnvironmentReady").connectTo("Task_ReviewCode"),
	)
	.branch("automation-failed", (branch) =>
		branch.label("Нет").defaultFlow().serviceTask("Task_NotifyDeveloper", {
			name: "Сообщить разработчику об ошибках",
			taskType: "notify-developer",
		}).connectTo("Gateway_DevelopmentEntry"),
	)
	.userTask("Task_ReviewCode", {
		name: "Проверить исходный код",
	})
	.exclusiveGateway("Gateway_CodeApproved", {
		name: "Код соответствует требованиям?",
	})
	.branch("code-approved", (branch) =>
		branch.label("Да").condition("= codeApproved").connectTo("Task_TestChanges"),
	)
	.branch("code-rework", (branch) =>
		branch.label("Нет").defaultFlow().connectTo("Gateway_DevelopmentEntry"),
	)
	.userTask("Task_TestChanges", {
		name: "Проверить функционал и совместимость",
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
	.serviceTask("Task_BuildAndDeployStagingVersion", {
		name: "Собрать и развернуть веб-сервисы в пре-продакшене",
		taskType: "build-and-deploy-staging",
		documentation: "Запускается автоматически после слияния изменений в основную ветку.",
	})
	.userTask("Task_CustomerAcceptance", {
		name: "Протестировать и согласовать изменения",
	})
	.exclusiveGateway("Gateway_CustomerApproved", {
		name: "Все требования заказчика выполнены?",
	})
	.branch("customer-approved", (branch) =>
		branch.label("Да").condition("= customerApproved").connectTo("Task_TriggerProductionDeployment"),
	)
	.branch("customer-rework", (branch) =>
		branch.label("Нет").defaultFlow().connectTo("Gateway_DevelopmentEntry"),
	)
	.userTask("Task_TriggerProductionDeployment", {
		name: "Запустить выпуск по расписанию релизов",
		documentation:
			"Руководитель команды самостоятельно запускает развёртывание согласованной версии через интерфейс подсистемы автоматизации.",
	})
	.serviceTask("Task_DeployProductionVersion", {
		name: "Развернуть согласованную версию в продакшене",
		taskType: "deploy-production",
	})
	.endEvent("Event_ChangesReleased", {
		name: "Изменения доступны пользователям",
	})
	.build({ explicitJoins: true });

const process = definitions.processes[0]!;
process.laneSet = {
	id: "LaneSet_ToBe",
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
				"Task_TriggerProductionDeployment",
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
			id: "Lane_Automation",
			name: "Подсистема автоматизации сборки и развёртывания",
			flowNodeRefs: [
				"Task_BuildAndDeployTestVersion",
				"Gateway_TestEnvironmentReady",
				"Task_NotifyDeveloper",
				"Task_BuildAndDeployStagingVersion",
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
		id: "Collaboration_ToBe",
		participants: [
			{
				id: "Participant_ToBe",
				name: "Внесение изменений в действующую ИС — TO-BE",
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
const pool = plane.shapes.find((shape) => shape.bpmnElement === "Participant_ToBe")!;
const laneIds = new Set(process.laneSet.lanes.map((lane) => lane.id));
const laneShapes = plane.shapes
	.filter((shape) => laneIds.has(shape.bpmnElement))
	.toSorted((a, b) => a.bounds.y - b.bounds.y);

for (let index = 0; index < laneShapes.length - 1; index++) {
	const lane = laneShapes[index]!;
	const nextLane = laneShapes[index + 1]!;
	const borderY = lane.bounds.y + lane.bounds.height;
	const touchesBorder = plane.edges.some((edge) => edge.waypoints.some((point, index) => {
		const next = edge.waypoints[index + 1];
		return next && point.y === borderY && next.y === borderY && point.x !== next.x;
	}));
	if (!touchesBorder) continue;

	const nextLaneRefs = new Set(process.laneSet.lanes.find((item) => item.id === nextLane.bpmnElement)!.flowNodeRefs);
	const nextNodeTop = Math.min(...plane.shapes
		.filter((shape) => nextLaneRefs.has(shape.bpmnElement))
		.map((shape) => shape.bounds.y));
	const padding = Math.min(16, Math.max(0, (nextNodeTop - borderY) / 2));
	lane.bounds.height += padding;
	nextLane.bounds.y += padding;
	nextLane.bounds.height -= padding;
}

const bottomLane = laneShapes.at(-1)!;
const lowestFlowY = Math.max(...plane.edges.flatMap((edge) => edge.waypoints.map((point) => point.y)));
const extraHeight = Math.max(0, lowestFlowY + 32 - (bottomLane.bounds.y + bottomLane.bounds.height));

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
await Bun.write(new URL("./to-be.bpmn", import.meta.url), Bpmn.export(diagram));
await Bun.write(new URL("./to-be.svg", import.meta.url), svg);
await Bun.write(
	new URL("../../images/bpmn-to-be.png", import.meta.url),
	await sharp(Buffer.from(svg), { density: 192 })
		.resize({ width: 8000 })
		.flatten({ background: "#ffffff" })
		.withMetadata({ density: 600 })
		.png()
		.toBuffer(),
);

console.log("Созданы `to-be.bpmn` и `to-be.svg` в `./diagrams/bpmn-to-be-model/`, PNG — в `./images/bpmn-to-be.png`");
