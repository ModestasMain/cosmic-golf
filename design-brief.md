# Cosmic Golf — Design Brief

## Concept
Multiplayer mini golf on tiny planets with real gravity wells. Orbit tiny planets, sink your ball using gravitational slingshots, beat your friends.

## Core Mechanics
- **Slingshot aim**: drag away from ball (like a real slingshot), power = drag distance, direction = reverse of drag vector
- **Gravity**: each planet pulls ball toward center using F = G*M/r^2, Euler integration, fully deterministic
- **Turn-based**: players alternate shots, all clients watch ball fly (physics is deterministic — only sync shot direction+power)

## Win Condition
Lowest total strokes across 5 holes wins.

## Lose Condition
Out of bounds (ball travels >300 units from scene center) = +2 stroke penalty, re-place ball at tee.

## Hole Generation
3–5 planets per hole, procedurally placed using seeded simplex noise. Tee placed at outer edge of cluster; cup placed near a planet surface on the opposite side, forcing at least one gravity slingshot to reach it.

## Color Palettes (one per hole)
- Hole 1: Pastel — pink/lavender/mint on deep purple sky
- Hole 2: Neon — electric cyan/hot pink/lime on near-black
- Hole 3: Warm — amber/coral/gold on dark orange sky
- Hole 4: Deep — navy/indigo/forest on midnight blue
- Hole 5: Cosmic Finale — violet/cyan/magenta on void black

## Multiplayer
Partykit WebSockets. Room code system. Only shot events (direction + power) are synced. Each client simulates physics independently (deterministic). Auto-fallback to solo mode after 10 seconds if no other player joins.

## Portal System
- Exit portal (torus + label) spawns after hole 5 completes → redirects to VibeJam webring
- Start portal: if `?portal=true` in URL, spawns a red return portal so player can go back to referrer
- URL params: `?username=`, `?color=`, `?ref=` applied to player session on load
