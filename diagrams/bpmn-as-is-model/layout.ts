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
	review: 8,
	testBuild: 9,
	test: 10,
	testDecision: 11,
	merge: 12,
	demonstration: 13,
	acceptance: 14,
	production: 15,
	released: 16,
} as const;

type Column = keyof typeof COLUMN;
type Lane = "lead" | "developer" | "administrator" | "customer";
type Side = "left" | "right" | "top" | "bottom";

/** Explicit AS-IS layout, preserving the separate return tracks in the edited BPMN. */
export function applyManualAsIsLayout(definitions: BpmnDefinitions): BpmnDefinitions {
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
	const customerTop = leadHeight + 2 * laneHeight;
	const customerHeight = laneHeight + LABEL.gateway.height + SPACE.labelGap + SPACE.returnTrack;
	const poolHeight = customerTop + customerHeight;
	const customerReturnY = poolHeight - SPACE.padding;
	const lanes = {
		lead: { id: "Lane_TeamLead", top: 0, height: leadHeight, center: leadY },
		developer: { id: "Lane_Developer", top: leadHeight, height: laneHeight, center: leadHeight + laneHeight / 2 },
		administrator: { id: "Lane_SystemAdministrator", top: leadHeight + laneHeight, height: laneHeight, center: leadHeight + laneHeight + laneHeight / 2 },
		customer: { id: "Lane_Customer", top: customerTop, height: customerHeight, center: customerTop + laneHeight / 2 },
	} satisfies Record<Lane, { id: string; top: number; height: number; center: number }>;

	shapes.push({
		id: "Participant_AsIs_di", bpmnElement: "Participant_AsIs", isHorizontal: true,
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
	place("Task_PushTemporaryBranch", "review", "developer");
	place("Task_ReviewCode", "review", "lead");
	place("Gateway_CodeApproved", "testBuild", "lead");
	place("Task_BuildTestVersion", "testBuild", "administrator");
	place("Task_DeployTestVersion", "test", "administrator");
	place("Task_TestChanges", "test", "lead");
	place("Gateway_TestsPassed", "testDecision", "lead");
	place("Task_MergeMainBranch", "merge", "lead");
	place("Task_BuildStagingVersion", "merge", "administrator");
	place("Task_DeployStagingVersion", "demonstration", "administrator");
	place("Task_CustomerAcceptance", "demonstration", "customer");
	place("Gateway_CustomerApproved", "acceptance", "customer");
	place("Task_BuildProductionVersion", "acceptance", "administrator");
	place("Task_DeployProductionVersion", "production", "administrator");
	place("Event_ChangesReleased", "released", "administrator");

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
	connect("Task_PushTemporaryBranch", "Task_ReviewCode", "top", "bottom");
	connect("Task_ReviewCode", "Gateway_CodeApproved", "right", "left");
	connect("Gateway_CodeApproved", "Task_BuildTestVersion", "bottom", "top");
	connect("Gateway_CodeApproved", "Gateway_DevelopmentEntry", "top", "top", {
		via: [
			{ x: columnX("testBuild"), y: codeReturnY },
			{ x: columnX("developmentEntry") + GRID, y: codeReturnY },
		],
		entryOffset: GRID,
	});
	connect("Task_BuildTestVersion", "Task_DeployTestVersion", "right", "left");
	connect("Task_DeployTestVersion", "Task_TestChanges", "top", "bottom");
	connect("Task_TestChanges", "Gateway_TestsPassed", "right", "left");
	connect("Gateway_TestsPassed", "Task_MergeMainBranch", "right", "left");
	connect("Gateway_TestsPassed", "Gateway_DevelopmentEntry", "top", "top", {
		via: [
			{ x: columnX("testDecision"), y: testReturnY },
			{ x: columnX("developmentEntry") - GRID, y: testReturnY },
		],
		entryOffset: -GRID,
	});
	connect("Task_MergeMainBranch", "Task_BuildStagingVersion", "bottom", "top");
	connect("Task_BuildStagingVersion", "Task_DeployStagingVersion", "right", "left");
	connect("Task_DeployStagingVersion", "Task_CustomerAcceptance", "bottom", "top");
	connect("Task_CustomerAcceptance", "Gateway_CustomerApproved", "right", "left");
	connect("Gateway_CustomerApproved", "Task_BuildProductionVersion", "top", "bottom");
	connect("Gateway_CustomerApproved", "Gateway_DevelopmentEntry", "bottom", "bottom", {
		via: [
			{ x: columnX("acceptance"), y: customerReturnY },
			{ x: columnX("developmentEntry"), y: customerReturnY },
		],
	});
	connect("Task_BuildProductionVersion", "Task_DeployProductionVersion", "right", "left");
	connect("Task_DeployProductionVersion", "Event_ChangesReleased", "right", "left");

	definitions.diagrams = [{
		id: "BPMNDiagram_AsIs",
		plane: { id: "BPMNPlane_AsIs", bpmnElement: "Collaboration_AsIs", shapes, edges },
	}];
	return definitions;
}
