import type { Match, PublicState } from "@shared/types";
import { decidedLabel, refereeLabel, teamById, teamName } from "../format";
import type { TreeNode } from "../tree";

const LEAF = 86;
const LEVEL = 78;
const PAD_X = 8;
const PAD_TOP = 54;
const NAME_H = 210;

type Props = {
  root: TreeNode;
  state: PublicState;
  crown: string;
  onSelect?: (match: Match) => void;
};

type LeafSpot = { node: TreeNode; x: number };
type MatchSpot = { node: Extract<TreeNode, { kind: "match" }>; x: number; depth: number };
type Line = { x1: number; y1: number; x2: number; y2: number };

export default function BracketBoard({ root, state, crown, onSelect }: Props) {
  const draw = layout(root);
  const width = draw.leafCount * LEAF + PAD_X * 2;
  const lineH = PAD_TOP + (draw.baseline + 1) * LEVEL;
  const height = lineH + NAME_H;
  const X = (unit: number) => PAD_X + unit * LEAF;
  const Y = (depth: number) => PAD_TOP + depth * LEVEL;

  return (
    <div className="board" style={{ width, height }}>
      <svg width={width} height={lineH} aria-hidden="true">
        {draw.lines.map((line, index) => (
          <line
            key={index}
            x1={X(line.x1)}
            y1={Y(line.y1)}
            x2={X(line.x2)}
            y2={Y(line.y2)}
            stroke="#111"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="b-crown" style={{ left: X(draw.rootX), top: 0 }}>
        {crown}
      </div>
      {draw.matches.map((spot) => (
        <MatchTag
          key={spot.node.match.id}
          spot={spot}
          state={state}
          left={X(spot.x)}
          top={Y(spot.depth)}
          onSelect={onSelect}
        />
      ))}
      {draw.leaves.map((leaf) => (
        <LeafTag
          key={leaf.x}
          leaf={leaf}
          state={state}
          left={X(leaf.x)}
          top={Y(draw.baseline)}
        />
      ))}
    </div>
  );
}

function MatchTag({
  spot,
  state,
  left,
  top,
  onSelect,
}: {
  spot: MatchSpot;
  state: PublicState;
  left: number;
  top: number;
  onSelect?: (match: Match) => void;
}) {
  const match = spot.node.match;
  const winner = teamById(state.teams, match.winnerId);
  const score =
    match.score1 !== null && match.score2 !== null ? `${match.score1}-${match.score2}` : "";
  const note = decidedLabel(match);
  const body = (
    <>
      <b>{match.code}</b>
      <small>
        {match.startTime}-{match.endTime}
      </small>
      <em className="ref-note">{shortReferee(match, state)}</em>
      {score ? <strong>{score}</strong> : null}
      {winner ? <strong className="b-advance">{winner.name}</strong> : null}
      {note ? <small>{note}</small> : null}
    </>
  );
  if (!onSelect) {
    return (
      <div className="b-tag" style={{ left, top }}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className="b-tag" style={{ left, top }} onClick={() => onSelect(match)}>
      {body}
    </button>
  );
}

function LeafTag({
  leaf,
  state,
  left,
  top,
}: {
  leaf: LeafSpot;
  state: PublicState;
  left: number;
  top: number;
}) {
  const text = labelOf(leaf.node, state);
  return (
    <div className="b-leaf" style={{ left, top }}>
      {text.mark ? <i>{text.mark}</i> : null}
      <strong>{text.name}</strong>
      {text.sub ? <small>{text.sub}</small> : null}
    </div>
  );
}

function shortReferee(match: Match, state: PublicState): string {
  if (match.refereeTeamId) {
    const team = teamById(state.teams, match.refereeTeamId);
    return team?.lab || team?.name || "審判";
  }
  const referee = match.refereeSource;
  if (referee.kind === "loser") {
    const src = state.matches.find((item) => item.id === referee.matchId);
    return src ? `${src.code}負` : "負け審";
  }
  if (referee.kind === "team") return teamName(state.teams, referee.teamId);
  return refereeLabel(match, state);
}

function labelOf(node: TreeNode, state: PublicState): { name: string; sub: string; mark: string } {
  if (node.kind === "team") {
    const team = teamById(state.teams, node.teamId);
    return { name: team?.name ?? "未定", sub: team?.lab ?? "", mark: "" };
  }
  if (node.kind === "loser") {
    const loser = loserTeam(node.match);
    const team = teamById(state.teams, loser);
    return {
      name: team?.name ?? `${node.match.code}負`,
      sub: team?.lab ?? "",
      mark: node.match.loserMark ?? "",
    };
  }
  return { name: node.match.code, sub: "", mark: "" };
}

function loserTeam(match: Match): string | null {
  if (!match.winnerId || !match.team1Id || !match.team2Id) return null;
  return match.winnerId === match.team1Id ? match.team2Id : match.team1Id;
}

function spanOf(node: TreeNode): number {
  if (node.kind !== "match") return 1;
  return spanOf(node.top) + spanOf(node.bottom);
}

function matchDepth(node: TreeNode): number {
  if (node.kind !== "match") return -1;
  return 1 + Math.max(matchDepth(node.top), matchDepth(node.bottom));
}

function layout(root: TreeNode): {
  leaves: LeafSpot[];
  matches: MatchSpot[];
  lines: Line[];
  leafCount: number;
  baseline: number;
  rootX: number;
} {
  const leaves: LeafSpot[] = [];
  const matches: MatchSpot[] = [];
  const lines: Line[] = [];
  const baseline = matchDepth(root) + 1;

  function place(node: TreeNode, leaf: number, depth: number): number {
    if (node.kind !== "match") {
      const x = leaf + 0.5;
      leaves.push({ node, x });
      return x;
    }
    const left = place(node.top, leaf, depth + 1);
    const right = place(node.bottom, leaf + spanOf(node.top), depth + 1);
    const x = (left + right) / 2;
    const yOf = (child: TreeNode) => (child.kind === "match" ? depth + 1 : baseline);
    lines.push({ x1: left, y1: yOf(node.top), x2: left, y2: depth });
    lines.push({ x1: right, y1: yOf(node.bottom), x2: right, y2: depth });
    lines.push({ x1: left, y1: depth, x2: right, y2: depth });
    matches.push({ node, x, depth });
    return x;
  }

  const rootX = place(root, 0, 0);
  return { leaves, matches, lines, leafCount: spanOf(root), baseline, rootX };
}
