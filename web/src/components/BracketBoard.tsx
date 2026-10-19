import type { Match, PublicState } from "@shared/types";
import { decidedLabel, refereeLabel, teamById, teamName } from "../format";
import type { TreeNode } from "../tree";

const LEAF = 96;
const LEVEL = 124;
const PAD_X = 8;
const PAD_TOP = 42;
const NAME_H = 230;

type Props = {
  root: TreeNode;
  state: PublicState;
  crown: string;
  onSelect?: (match: Match) => void;
  onLab?: (lab: string) => void;
};

type LeafSpot = { node: TreeNode; x: number; faded: boolean };
type MatchSpot = { node: Extract<TreeNode, { kind: "match" }>; x: number; depth: number };
type Line = { x1: number; y1: number; x2: number; y2: number; live: boolean; faded: boolean };

export default function BracketBoard({ root, state, crown, onSelect, onLab }: Props) {
  const draw = layout(root);
  const width = draw.leafCount * LEAF + PAD_X * 2;
  const lineH = PAD_TOP + (draw.baseline + 1) * LEVEL;
  const height = lineH + NAME_H;
  const X = (unit: number) => PAD_X + unit * LEAF;
  const Y = (depth: number) => PAD_TOP + depth * LEVEL;

  return (
    <div className="board" style={{ width, height }}>
      <svg width={width} height={lineH} aria-hidden="true">
        {[...draw.lines]
          .sort((a, b) => lineRank(a) - lineRank(b))
          .map((line, index) => (
          <line
            key={index}
            x1={X(line.x1)}
            y1={Y(line.y1)}
            x2={X(line.x2)}
            y2={Y(line.y2)}
            stroke={line.live ? "#c40000" : line.faded ? "#d5cfc4" : "#111"}
            strokeWidth={line.live ? 3.5 : line.faded ? 1.5 : 2}
            strokeLinecap="square"
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
          onLab={onLab}
        />
      ))}
      {draw.leaves.map((leaf) => (
        <LeafTag
          key={leaf.x}
          leaf={leaf}
          state={state}
          left={X(leaf.x)}
          top={Y(draw.baseline)}
          onLab={onLab}
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
  onLab,
}: {
  spot: MatchSpot;
  state: PublicState;
  left: number;
  top: number;
  onSelect?: (match: Match) => void;
  onLab?: (lab: string) => void;
}) {
  const match = spot.node.match;
  const winner = teamById(state.teams, match.winnerId);
  const score =
    match.score1 !== null && match.score2 !== null ? `${match.score1}-${match.score2}` : "";
  const note = decidedLabel(match);
  const refLab = refereeLab(match, state);
  const body = (
    <>
      <b className="b-code">
        {match.code}
        {score ? <span className="b-score">{score}</span> : null}
      </b>
      {winner ? <strong className="b-winner">{winner.name}</strong> : null}
      {note ? <small className="b-note">{note}</small> : null}
      <small className="b-time">
        {match.startTime}-{match.endTime}
      </small>
    </>
  );
  return (
    <div className="b-tag" style={{ left, top }}>
      {onSelect ? (
        <button type="button" className="b-tag-hit" onClick={() => onSelect(match)}>
          {body}
        </button>
      ) : (
        body
      )}
      <em className="b-ref">
        審{" "}
        {refLab && onLab ? (
          <button type="button" className="b-lab b-lab-ref" onClick={() => onLab(refLab)}>
            {shortReferee(match, state)}
          </button>
        ) : (
          shortReferee(match, state)
        )}
      </em>
    </div>
  );
}

function LeafTag({
  leaf,
  state,
  left,
  top,
  onLab,
}: {
  leaf: LeafSpot;
  state: PublicState;
  left: number;
  top: number;
  onLab?: (lab: string) => void;
}) {
  const text = labelOf(leaf.node, state);
  return (
    <div className={`b-leaf${leaf.faded ? " is-out" : ""}`} style={{ left, top, width: LEAF - 8 }}>
      {text.mark ? <i className="b-name">{text.mark}</i> : <i className="b-name" />}
      <strong className="b-name">{text.name}</strong>
      {text.sub ? (
        onLab ? (
          <button type="button" className="b-lab b-name" onClick={() => onLab(text.sub)}>
            {text.sub}
          </button>
        ) : (
          <small className="b-name">{text.sub}</small>
        )
      ) : (
        <small className="b-name" />
      )}
    </div>
  );
}

function refereeLab(match: Match, state: PublicState): string {
  if (match.refereeTeamId) return teamById(state.teams, match.refereeTeamId)?.lab ?? "";
  if (match.refereeSource.kind === "team") return teamById(state.teams, match.refereeSource.teamId)?.lab ?? "";
  return "";
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

function lineRank(line: Line): number {
  if (line.live) return 2;
  if (line.faded) return 0;
  return 1;
}

function stemStyle(child: TreeNode, won: boolean, decided: boolean): { live: boolean; faded: boolean } {
  if (won) return { live: true, faded: false };
  if (decided) return { live: false, faded: true };
  if (child.kind === "match" && child.match.winnerId) return { live: true, faded: false };
  return { live: false, faded: false };
}

function advancedTeamId(node: TreeNode): string | null {
  if (node.kind === "team") return node.teamId || null;
  if (node.kind === "loser") return loserTeam(node.match);
  return node.match.winnerId;
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

  function place(node: TreeNode, leaf: number, depth: number, fadedBranch: boolean): number {
    if (node.kind !== "match") {
      const x = leaf + 0.5;
      leaves.push({ node, x, faded: fadedBranch });
      return x;
    }
    const winnerId = node.match.winnerId;
    const topWon = Boolean(winnerId && advancedTeamId(node.top) === winnerId);
    const bottomWon = Boolean(winnerId && advancedTeamId(node.bottom) === winnerId);
    const decided = Boolean(winnerId);
    const left = place(node.top, leaf, depth + 1, fadedBranch || (decided && !topWon));
    const right = place(node.bottom, leaf + spanOf(node.top), depth + 1, fadedBranch || (decided && !bottomWon));
    const x = (left + right) / 2;
    const yOf = (child: TreeNode) => (child.kind === "match" ? depth + 1 : baseline);
    const topStem = stemStyle(node.top, topWon, decided);
    const bottomStem = stemStyle(node.bottom, bottomWon, decided);
    lines.push({ x1: left, y1: yOf(node.top), x2: left, y2: depth, ...topStem });
    lines.push({ x1: right, y1: yOf(node.bottom), x2: right, y2: depth, ...bottomStem });
    lines.push({ x1: left, y1: depth, x2: x, y2: depth, live: topWon, faded: decided && !topWon });
    lines.push({ x1: x, y1: depth, x2: right, y2: depth, live: bottomWon, faded: decided && !bottomWon });
    matches.push({ node, x, depth });
    return x;
  }

  const rootX = place(root, 0, 0, false);
  return { leaves, matches, lines, leafCount: spanOf(root), baseline, rootX };
}
