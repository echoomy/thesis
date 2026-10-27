import type { BpmnBounds, BpmnDefinitions, BpmnDiEdge, BpmnDiShape, BpmnWaypoint } from "@bpmnkit/core";

// All dimensions, coordinates, ports and labels use the same integer grid.
const GRID = 10;
const SIZE = {
	task: { width: 12 * GRID, height: 8 * GRID },
	event: { width: 4 * GRID, height: 4 * GRID },
	gateway: { width: 6 * GRID, height: 6 * GRID },
};
const SPACE = {
	poolHeader: 3 * GRID,
	laneHeader: 3 * GRID,
	padding: 4 * GRID,
	columnGap: 6 * GRID,
	returnTrack: 4 * GRID,
	labelGap: GRID,
	decisionLabelGap: 2 * GRID,
};
const LABEL = {
	event: { width: 22 * GRID, height: 4 * GRID },
	gateway: { width: 16 * GRID, height: 4 * GRID },
	flow: { width: 4 * GRID, height: 2 * GRID },
};
// Reserve enough height for the full, rotated automation lane title.
const AUTOMATION_LANE_MIN_HEIGHT = 32 * GRID;

// A shared column makes hand-offs between lanes straight vertical arrows.
const COLUMN = {
	feedback: 0,
	risks: 1,
	feasibility: 2,
	specification: 3,
	tracker: 4,
	assignment: 5,
	developmentEntry: 6,
	implementation: 7,
	testBuild: 8,
	review: 9,
	codeDecision: 10,
	test: 11,
	testDecision: 12,
	merge: 13,
	acceptance: 14,
	production: 15,
	released: 16,
} as const;

type Column = keyof typeof COLUMN;
type Lane = "lead" | "developer" | "automation" | "customer";
type Side = "left" | "right" | "top" | "bottom";

/** Explicit TO-BE layout with separate code, testing, automation and customer returns. */
export function applyManualToBeLayout(definitions: BpmnDefinitions): BpmnDefinitions {
	const process = definitions.processes[0]!;
	const elements = new Map(process.flowElements.map((element) => [element.id, element]));
	const shapes: BpmnDiShape[] = [];
	const edges: BpmnDiEdge[] = [];
	const nodes = new Map<string, BpmnDiShape>();
	const columnPitch = SIZE.task.width + SPACE.columnGap;
	const firstColumnX = SPACE.poolHeader + SPACE.laneHeader + SPACE.padding + LABEL.event.width / 2;
	const columnX = (column: Column) => firstColumnX + COLUMN[column] * columnPitch;
	const poolWidth = columnX("released") + LABEL.event.width / 2 + SPACE.padding;

	const testReturnY = SPACE.padding + LABEL.flow.height + SPACE.labelGap;
	const codeReturnY = testReturnY + SPACE.returnTrack;
	const leadY = codeReturnY + SPACE.returnTrack + SIZE.task.height / 2;
	const rejectionY = leadY + SIZE.task.height + SPACE.returnTrack;
	const leadHeight = rejectionY + SIZE.event.height / 2 + SPACE.labelGap + LABEL.event.height + SPACE.padding;
	const laneHeight = SIZE.task.height + 2 * SPACE.padding;
	const automationTop = leadHeight + laneHeight;
	const automationY = automationTop + laneHeight / 2;
	const automationQuestionBottom = automationY + SIZE.gateway.height / 2 + SPACE.decisionLabelGap + LABEL.gateway.height;
	const automationReturnY = automationQuestionBottom + SPACE.returnTrack;
	const automationHeight = Math.max(AUTOMATION_LANE_MIN_HEIGHT, automationReturnY + SPACE.padding - automationTop);
	const customerTop = automationTop + automationHeight;
	const customerHeight = laneHeight + LABEL.gateway.height + SPACE.labelGap + SPACE.returnTrack;
	const poolHeight = customerTop + customerHeight;
	const customerReturnY = poolHeight - SPACE.padding;
	const lanes = {
		lead: { id: "Lane_TeamLead", top: 0, height: leadHeight, center: leadY },
		developer: { id: "Lane_Developer", top: leadHeight, height: laneHeight, center: leadHeight + laneHeight / 2 },
		automation: { id: "Lane_Automation", top: automationTop, height: automationHeight, center: automationY },
		customer: { id: "Lane_Customer", top: customerTop, height: customerHeight, center: customerTop + laneHeight / 2 },
	} satisfies Record<Lane, { id: string; top: number; height: number; center: number }>;

	shapes.push({
		id: "Participant_ToBe_di", bpmnElement: "Participant_ToBe", isHorizontal: true,
		bounds: { x: 0, y: 0, width: poolWidth, height: poolHeight }, unknownAttributes: {},
	});
	for (const lane of Object.values(lanes)) {
		shapes.push({
			id: `${lane.id}_di`, bpmnElement: lane.id, isHorizontal: true,
			bounds: { x: SPACE.poolHeader, y: lane.top, width: poolWidth - SPACE.poolHeader, height: lane.height },
			unknownAttributes: {},
		});
	}

	function place(id: string, column: Column, lane: Lane, centerY = lanes[lane].center): void {
		const element = elements.get(id);
		if (!element) throw new Error(`Неизвестный элемент: ${id}`);
		const isGateway = element.type === "exclusiveGateway";
		const isEvent = element.type === "startEvent" || element.type === "endEvent";
		const size = isGateway ? SIZE.gateway : isEvent ? SIZE.event : SIZE.task;
		const centerX = columnX(column);
		const bounds: BpmnBounds = { x: centerX - size.width / 2, y: centerY - size.height / 2, ...size };
		const shape: BpmnDiShape = {
			id: `${id}_di`, bpmnElement: id, bounds, unknownAttributes: {},
			...(isGateway ? { isMarkerVisible: true } : {}),
		};
		if ((isGateway || isEvent) && element.name) {
			// Questions sit below and left of the decision, clear of vertical exits.
			const labelSize = isGateway ? LABEL.gateway : LABEL.event;
			shape.label = { bounds: {
				x: isGateway ? centerX - labelSize.width - SPACE.labelGap : centerX - labelSize.width / 2,
				y: bounds.y + bounds.height + (isGateway ? SPACE.decisionLabelGap : SPACE.labelGap),
				...labelSize,
			} };
		}
		shapes.push(shape);
		nodes.set(id, shape);
	}

	place("Event_FeedbackReceived", "feedback", "lead");
	place("Task_AnalyzeRisks", "risks", "lead");
	place("Gateway_ImplementationPossible", "feasibility", "lead");
	place("Event_ChangeNotApproved", "specification", "lead", rejectionY);
	place("Task_PrepareSpecification", "specification", "lead");
	place("Task_CreateTrackerIssue", "tracker", "lead");
	place("Task_AssignDevelopers", "assignment", "lead");
	place("Gateway_DevelopmentEntry", "developmentEntry", "developer");
	place("Task_ImplementChanges", "implementation", "developer");
	place("Task_PushTemporaryBranch", "testBuild", "developer");
	place("Task_BuildAndDeployTestVersion", "testBuild", "automation");
	place("Gateway_TestEnvironmentReady", "review", "automation");
	place("Task_NotifyDeveloper", "codeDecision", "automation");
	place("Task_ReviewCode", "review", "lead");
	place("Gateway_CodeApproved", "codeDecision", "lead");
	place("Task_TestChanges", "test", "lead");
	place("Gateway_TestsPassed", "testDecision", "lead");
	place("Task_MergeMainBranch", "merge", "lead");
	place("Task_BuildAndDeployStagingVersion", "merge", "automation");
	place("Task_CustomerAcceptance", "merge", "customer");
	place("Gateway_CustomerApproved", "acceptance", "customer");
	place("Task_TriggerProductionDeployment", "production", "lead");
	place("Task_DeployProductionVersion", "production", "automation");
	place("Event_ChangesReleased", "released", "automation");

	function port(id: string, side: Side, offset = 0): BpmnWaypoint {
		const { x, y, width, height } = nodes.get(id)!.bounds;
		if (side === "left") return { x, y: y + height / 2 };
		if (side === "right") return { x: x + width, y: y + height / 2 };
		const inset = elements.get(id)!.type === "exclusiveGateway" ? Math.abs(offset) : 0;
		return { x: x + width / 2 + offset, y: side === "top" ? y + inset : y + height - inset };
	}

	function connect(source: string, target: string, exit: Side, entry: Side, options: {
		via?: BpmnWaypoint[];
		entryOffset?: number;
	} = {}): void {
		const flow = process.sequenceFlows.find((flow) => flow.sourceRef === source && flow.targetRef === target);
		if (!flow) throw new Error(`Неизвестный переход: ${source} → ${target}`);
		const start = port(source, exit);
		const end = port(target, entry, options.entryOffset);
		const edge: BpmnDiEdge = {
			id: `${flow.id}_di`, bpmnElement: flow.id,
			waypoints: [start, ...(options.via ?? []), end], unknownAttributes: {},
		};
		if (flow.name) {
			edge.label = { bounds: {
				x: start.x + SPACE.labelGap,
				y: exit === "bottom" ? start.y + SPACE.labelGap : start.y - SPACE.labelGap - LABEL.flow.height,
				...LABEL.flow,
			} };
		}
		edges.push(edge);
	}

	connect("Event_FeedbackReceived", "Task_AnalyzeRisks", "right", "left");
	connect("Task_AnalyzeRisks", "Gateway_ImplementationPossible", "right", "left");
	connect("Gateway_ImplementationPossible", "Task_PrepareSpecification", "right", "left");
	connect("Gateway_ImplementationPossible", "Event_ChangeNotApproved", "bottom", "left", {
		via: [{ x: columnX("feasibility"), y: rejectionY }],
	});
	connect("Task_PrepareSpecification", "Task_CreateTrackerIssue", "right", "left");
	connect("Task_CreateTrackerIssue", "Task_AssignDevelopers", "right", "left");
	connect("Task_AssignDevelopers", "Gateway_DevelopmentEntry", "bottom", "left", {
		via: [{ x: columnX("assignment"), y: lanes.developer.center }],
	});
	connect("Gateway_DevelopmentEntry", "Task_ImplementChanges", "right", "left");
	connect("Task_ImplementChanges", "Task_PushTemporaryBranch", "right", "left");
	connect("Task_PushTemporaryBranch", "Task_BuildAndDeployTestVersion", "bottom", "top");
	connect("Task_BuildAndDeployTestVersion", "Gateway_TestEnvironmentReady", "right", "left");
	connect("Gateway_TestEnvironmentReady", "Task_ReviewCode", "top", "bottom");
	connect("Gateway_TestEnvironmentReady", "Task_NotifyDeveloper", "right", "left");
	connect("Task_NotifyDeveloper", "Gateway_DevelopmentEntry", "bottom", "bottom", {
		via: [
			{ x: columnX("codeDecision"), y: automationReturnY },
			{ x: columnX("developmentEntry") + GRID, y: automationReturnY },
		],
		entryOffset: GRID,
	});
	connect("Task_ReviewCode", "Gateway_CodeApproved", "right", "left");
	connect("Gateway_CodeApproved", "Task_TestChanges", "right", "left");
	connect("Gateway_CodeApproved", "Gateway_DevelopmentEntry", "top", "top", {
		via: [
			{ x: columnX("codeDecision"), y: codeReturnY },
			{ x: columnX("developmentEntry") + GRID, y: codeReturnY },
		],
		entryOffset: GRID,
	});
	connect("Task_TestChanges", "Gateway_TestsPassed", "right", "left");
	connect("Gateway_TestsPassed", "Task_MergeMainBranch", "right", "left");
	connect("Gateway_TestsPassed", "Gateway_DevelopmentEntry", "top", "top", {
		via: [
			{ x: columnX("testDecision"), y: testReturnY },
			{ x: columnX("developmentEntry") - GRID, y: testReturnY },
		],
		entryOffset: -GRID,
	});
	connect("Task_MergeMainBranch", "Task_BuildAndDeployStagingVersion", "bottom", "top");
	connect("Task_BuildAndDeployStagingVersion", "Task_CustomerAcceptance", "bottom", "top");
	connect("Task_CustomerAcceptance", "Gateway_CustomerApproved", "right", "left");
	connect("Gateway_CustomerApproved", "Task_TriggerProductionDeployment", "top", "left", {
		via: [{ x: columnX("acceptance"), y: lanes.lead.center }],
	});
	connect("Gateway_CustomerApproved", "Gateway_DevelopmentEntry", "bottom", "bottom", {
		via: [
			{ x: columnX("acceptance"), y: customerReturnY },
			{ x: columnX("developmentEntry") - GRID, y: customerReturnY },
		],
		entryOffset: -GRID,
	});
	connect("Task_TriggerProductionDeployment", "Task_DeployProductionVersion", "bottom", "top");
	connect("Task_DeployProductionVersion", "Event_ChangesReleased", "right", "left");

	definitions.diagrams = [{
		id: "BPMNDiagram_ToBe",
		plane: { id: "BPMNPlane_ToBe", bpmnElement: "Collaboration_ToBe", shapes, edges },
	}];
	return definitions;
}
