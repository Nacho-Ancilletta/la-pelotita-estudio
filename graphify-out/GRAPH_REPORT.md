# Graph Report - la-pelotita-estudio  (2026-09-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 464 nodes · 833 edges · 24 communities (16 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ab506f79`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21

## God Nodes (most connected - your core abstractions)
1. `recommend()` - 18 edges
2. `TacticoTab()` - 17 edges
3. `compilerOptions` - 16 edges
4. `getCandidatePool()` - 13 edges
5. `getTablaPosiciones()` - 13 edges
6. `EspnFixtures()` - 13 edges
7. `getGoalkeeperPool()` - 12 edges
8. `FantasyPremierTab()` - 11 edges
9. `GrandTTab()` - 10 edges
10. `getFichajesData()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `buscar()` --calls--> `recommend()`  [EXTRACTED]
  src/components/tabs/RefuerzoMagicoTab.tsx → src/lib/refuerzo-magico.ts
- `TacticoTab()` --calls--> `espnTeamLogoUrl()`  [EXTRACTED]
  src/components/tabs/TacticoTab.tsx → src/lib/espn.ts
- `getEspnLogos()` --calls--> `espnTeamLogoUrl()`  [EXTRACTED]
  src/lib/combinada-fecha.ts → src/lib/espn.ts
- `resolveSheetUrl()` --calls--> `getLatestGrandTSheet()`  [EXTRACTED]
  src/components/tabs/GrandTTab.tsx → src/lib/grandt.ts
- `enrichWithBio()` --calls--> `getSquad()`  [EXTRACTED]
  src/lib/refuerzo-magico.ts → src/lib/promiedos.ts

## Import Cycles
- None detected.

## Communities (24 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (68): getScores365Data(), penaltyCount(), RawRow, Score365DataFile, Scores365PlayerStats, SCORES_365_DATA, espnTeamLogoUrl(), photoUrlFromSlug() (+60 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (53): cacheGet(), cacheSet(), flattenTeams(), formatKickoff(), GRANDT_LEAGUE, GrandTTab(), setRecommended(), lastCompletedRoundNumber() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (46): addDays(), cacheGet(), cacheKey(), cacheSet(), DayPanel(), EspnBroadcast, EspnCompetition, EspnCompetitor (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (33): ArrowsOverlay(), Arrow, clamp(), FORMATION_KEYS, FORMATIONS, makeTeam(), Player, PitchSVG() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (34): AEM_BY_TEAM, cacheGet(), cacheSet(), CombinadaDataFile, CONCEDED_BY_TEAM, DATA, EspnTeamLite, FORM_LOCAL_BY_TEAM (+26 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, next, dependencies, next, react, react-dom, devDependencies (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (28): cacheGet(), cacheSet(), FantasyPremierTab(), setRecommended(), FdrBadge(), fdrClasses(), normalize(), PositionPanel() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (18): formatKickoff(), GolesTeamRow(), MiCombinadaSection(), parseKickoff(), PppComparisonBlock(), pppMatchLabel(), signedPctSmall(), ComboMatch (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (14): TabId, TABS, EnVivoTab(), CandidateCard(), cardsRow(), POSITION_LABEL, RefuerzoMagicoTab(), buscar() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.26
Nodes (11): cacheGet(), cacheSet(), CATEGORY_SLUGS, CategoryRow, delay(), fetchHtml(), FichajesPlayerData, FichajesProfile (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.27
Nodes (11): analyzeMatch(), blendSeason(), blendWithForm(), buildFormaGolesTeam(), buildTeamPppSelf(), clamp(), computeMarketSignal(), expectedTotalGoals() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.38
Nodes (7): CombinadaFechaTab(), removePick(), togglePick(), getKnownResults(), getSelectedPicks(), saveKnownResult(), saveSelectedPicks()

### Community 13 - "Community 13"
Cohesion: 0.43
Nodes (7): leanBadgeClasses(), MarketBlock(), marketLabel(), MatchCard(), toggleOver25(), togglePpp(), pickId()

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (3): geist, metadata, spaceMono

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (3): BloggerFeedEntry, discoverLatestSheet(), GET()

## Knowledge Gaps
- **140 isolated node(s):** `RawRow`, `Score365DataFile`, `DimCategory`, `Escalon`, `EscalonInfo` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 176 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TacticoTab()` connect `Community 3` to `Community 0`, `Community 9`, `Community 2`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `getTablaPosiciones()` connect `Community 1` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `espnTeamLogoUrl()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `RawRow`, `Score365DataFile`, `DimCategory` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05672926447574335 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08116883116883117 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07397959183673469 - nodes in this community are weakly interconnected._