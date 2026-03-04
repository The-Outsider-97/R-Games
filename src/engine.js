import { CONFIG, ActionType } from './constants.js';

class Unit {
  constructor(id, playerId, type, row, col) {
    this.id = id;
    this.playerId = playerId;
    this.type = type;
    this.row = row;
    this.col = col;
    this.props = CONFIG.unit_types[type];
    this.health = this.props.health;
    this.maxHealth = this.props.health;
    this.fatigueUntilRound = -1;
  }

  canAct(currentRound) {
    return this.health > 0 && this.fatigueUntilRound <= currentRound;
  }

  takeDamage(amount = 1) {
    this.health -= amount;
    return this.health <= 0;
  }
}

class Board {
  constructor(size) {
    this.size = size;
    this.grid = Array(size).fill(null).map(() => Array(size).fill(null));
  }

  placeUnit(unit) {
    this.grid[unit.row][unit.col] = unit;
  }

  removeUnit(unit) {
    if (this.grid[unit.row][unit.col] === unit) {
      this.grid[unit.row][unit.col] = null;
    }
  }

  moveUnit(unit, newRow, newCol) {
    this.grid[unit.row][unit.col] = null;
    unit.row = newRow;
    unit.col = newCol;
    this.grid[newRow][newCol] = unit;
  }

  getUnitAt(row, col) {
    if (row >= 0 && row < this.size && col >= 0 && col < this.size) {
      return this.grid[row][col];
    }
    return null;
  }

  isCoreCell(row, col) {
    const { rows, cols } = CONFIG.board.core;
    return row >= rows[0] && row <= rows[1] && col >= cols[0] && col <= cols[1];
  }

  pathClear(unit, targetRow, targetCol, movingUnits = new Set()) {
    const dr = targetRow - unit.row;
    const dc = targetCol - unit.col;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    
    if (steps === 0) return true;

    const stepR = dr === 0 ? 0 : dr / steps;
    const stepC = dc === 0 ? 0 : dc / steps;

    let r = unit.row;
    let c = unit.col;

    for (let i = 1; i < steps; i++) {
      r += stepR;
      c += stepC;
      const occupant = this.getUnitAt(Math.round(r), Math.round(c));
      // Friendly jumping allowed: Only block if occupant is enemy
      if (occupant && occupant.playerId !== unit.playerId && !movingUnits.has(occupant)) {
        return false;
      }
    }
    return true;
  }
}

class Player {
  constructor(id, board) {
    this.id = id;
    this.board = board;
    this.units = [];
    this.tokens = [...CONFIG.action_tokens];
    this.usedTokens = new Set();
    this.score = 0;
  }

  createUnits() {
    const homeRow = CONFIG.home_rows[this.id];
    
    // Fixed Lineup: [S] [S] [S] [W] [C] [W] [S] [S] [S]
    const lineup = ['Scout', 'Scout', 'Scout', 'Warden', 'Strategos', 'Warden', 'Scout', 'Scout', 'Scout'];
    
    lineup.forEach((type, col) => {
      const count = this.units.filter(u => u.type === type).length;
      const unitId = `P${this.id}_${type}_${count}`;
      
      const unit = new Unit(unitId, this.id, type, homeRow, col);
      this.units.push(unit);
      this.board.placeUnit(unit);
    });
  }

  getActiveUnits(round) {
    return this.units.filter(u => u.canAct(round));
  }

  canUseToken(token) {
    return this.tokens.includes(token) && !this.usedTokens.has(token);
  }

  useToken(token) {
    this.usedTokens.add(token);
  }

  resetTokens() {
    this.usedTokens.clear();
  }
}

export class Game {
  constructor() {
    this.board = new Board(CONFIG.board.size);
    this.players = [
      new Player(0, this.board),
      new Player(1, this.board)
    ];
    this.players.forEach(p => p.createUnits());
    
    this.timeline = Array(5).fill(null).map(() => [null, null]); // [p0_action, p1_action]
    this.round = 0;
    this.phase = 'planning'; // 'planning' | 'resolution' | 'game_over'
    this.currentSlot = 0;
    this.currentPlayerId = 0; // 0 or 1
    this.actingUnits = new Set();
    this.winner = null;
    this.winningEvent = null;
    this.logs = [];
  }

  get units() {
    return this.players.flatMap(p => p.units);
  }

  log(msg) {
    this.logs.push(`[Round ${this.round + 1}] ${msg}`);
  }

  getCorePoints(playerId) {
    let total = 0;
    const { rows, cols } = CONFIG.board.core;
    for (let r = rows[0]; r <= rows[1]; r++) {
      for (let c = cols[0]; c <= cols[1]; c++) {
        const unit = this.board.getUnitAt(r, c);
        if (unit && unit.playerId === playerId && unit.health > 0) {
          // Center Core (4,4) is 2x multiplier, others are 1x
          const multiplier = (r === 4 && c === 4) ? 2 : 1;
          total += unit.props.value * multiplier;
        }
      }
    }
    return total;
  }

  checkWinConditions() {
    // 1. Strategos death
    const p0Strategos = this.players[0].units.find(u => u.type === 'Strategos' && u.health > 0);
    const p1Strategos = this.players[1].units.find(u => u.type === 'Strategos' && u.health > 0);

    if (!p0Strategos && !p1Strategos) {
        this.winner = -1; // Draw
        this.phase = 'game_over';
        this.log("Game Over. Draw (Mutual Strategos Elimination).");
        return -1;
    } else if (!p0Strategos) {
        this.winner = 1;
        this.phase = 'game_over';
        this.log("Game Over. Player 2 wins (Strategos eliminated).");
        return 1;
    } else if (!p1Strategos) {
        this.winner = 0;
        this.phase = 'game_over';
        this.log("Game Over. Player 1 wins (Strategos eliminated).");
        return 0;
    }

    // 2. Cumulative Score threshold (>= 5)
    const WIN_THRESHOLD = 5;
    const p0Score = this.players[0].score;
    const p1Score = this.players[1].score;

    if (p0Score >= WIN_THRESHOLD && p1Score >= WIN_THRESHOLD) {
        this.resolveTie(p0Score, p1Score);
    } else if (p0Score >= WIN_THRESHOLD) {
        this.winner = 0;
        this.phase = 'game_over';
        this.winningEvent = { type: 'core_control', player: 0 };
        this.log(`Game Over. Player 1 wins (Score ${p0Score} >= ${WIN_THRESHOLD}).`);
        return 0;
    } else if (p1Score >= WIN_THRESHOLD) {
        this.winner = 1;
        this.phase = 'game_over';
        this.winningEvent = { type: 'core_control', player: 1 };
        this.log(`Game Over. Player 2 wins (Score ${p1Score} >= ${WIN_THRESHOLD}).`);
        return 1;
    }

    return null;
  }

  resolveTie(p0Points, p1Points) {
      // 1. Center Core Occupancy
      const centerUnit = this.board.getUnitAt(4, 4);
      if (centerUnit && centerUnit.health > 0) {
          this.winner = centerUnit.playerId;
          this.phase = 'game_over';
          this.log(`Game Over. Player ${this.winner + 1} wins (Tie breaker: Center Core).`);
          return;
      }

      // 2. Fewest Pieces
      const p0Pieces = this.players[0].units.filter(u => u.health > 0).length;
      const p1Pieces = this.players[1].units.filter(u => u.health > 0).length;
      
      if (p0Pieces < p1Pieces) {
          this.winner = 0;
          this.phase = 'game_over';
          this.log(`Game Over. Player 1 wins (Tie breaker: Fewest Pieces ${p0Pieces} vs ${p1Pieces}).`);
      } else if (p1Pieces < p0Pieces) {
          this.winner = 1;
          this.phase = 'game_over';
          this.log(`Game Over. Player 2 wins (Tie breaker: Fewest Pieces ${p1Pieces} vs ${p0Pieces}).`);
      } else {
          // 3. Sudden Death (Play one more turn)
          // We can't easily extend the game state here without logic change.
          // For now, declare Draw or Score comparison.
          if (p0Points > p1Points) {
              this.winner = 0;
              this.phase = 'game_over';
              this.log(`Game Over. Player 1 wins (Points ${p0Points} vs ${p1Points}).`);
          } else if (p1Points > p0Points) {
              this.winner = 1;
              this.phase = 'game_over';
              this.log(`Game Over. Player 2 wins (Points ${p1Points} vs ${p0Points}).`);
          } else {
              this.log("Sudden Death condition met. Continuing game.");
          }
      }
  }

  getPossibleActions(unit) {
    const actions = { move: [], attack: [], claim: false };
    
    // Moves
    for (let dr = -unit.props.movement; dr <= unit.props.movement; dr++) {
      for (let dc = -unit.props.movement; dc <= unit.props.movement; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > unit.props.movement || (dr === 0 && dc === 0)) continue;
        
        const nr = unit.row + dr;
        const nc = unit.col + dc;
        
        if (nr >= 0 && nr < this.board.size && nc >= 0 && nc < this.board.size) {
          // Friendly fire forbidden: Cannot target tile occupied by friendly
          const occupant = this.board.getUnitAt(nr, nc);
          if (occupant && occupant.playerId === unit.playerId) continue;

          // Check path (ignoring friendlies for jumping)
          if (this.board.pathClear(unit, nr, nc)) {
            actions.move.push({ r: nr, c: nc });
          }
        }
      }
    }

    // Attacks (Adjacent only)
    const adj = [[-1,0], [1,0], [0,-1], [0,1]];
    adj.forEach(([dr, dc]) => {
      const nr = unit.row + dr;
      const nc = unit.col + dc;
      const target = this.board.getUnitAt(nr, nc);
      if (target && target.playerId !== unit.playerId && target.health > 0) {
        actions.attack.push(target);
      }
    });

    // Claim
    if (this.board.isCoreCell(unit.row, unit.col)) {
      actions.claim = true;
    }

    return actions;
  }

  placeAction(playerId, slot, token, unit, actionType, params) {
    if (this.phase !== 'planning') return false;
    if (playerId !== this.currentPlayerId) return false;
    if (slot !== this.currentSlot) return false;
    
    const player = this.players[playerId];
    if (!player.canUseToken(token)) return false;
    if (!unit.canAct(this.round)) return false;

    // Check if unit already acted in this timeline
    for (let i = 0; i < 5; i++) {
      const [a0, a1] = this.timeline[i];
      if ((a0 && a0.unit === unit) || (a1 && a1.unit === unit)) return false;
    }

    const action = {
      token,
      unit,
      type: actionType,
      params
    };

    this.timeline[slot][playerId] = action;
    player.useToken(token);

    // Turn logic
    if (this.currentPlayerId === 0) {
      this.currentPlayerId = 1;
    } else {
      this.currentPlayerId = 0;
      this.currentSlot++;
      if (this.currentSlot >= 5) {
        this.phase = 'resolution';
        this.currentSlot = 0;
        this.log("Planning phase complete. Starting resolution.");
      }
    }
    return true;
  }

  resolveNextSlot() {
    if (this.phase !== 'resolution') return null;
    if (this.currentSlot >= 5) return null;

    const slotIdx = this.currentSlot;
    const [p0Act, p1Act] = this.timeline[slotIdx];
    const results = [];

    // Mark acting units
    if (p0Act) this.actingUnits.add(p0Act.unit);
    if (p1Act) this.actingUnits.add(p1Act.unit);

    // 1. Resolve Attacks
    const unitsToKill = new Set();
    const unitsDamaged = new Set();
    const damageSources = new Map(); // victim -> attacker

    const resolveAttack = (attackerAct, defenderAct) => {
      const attacker = attackerAct.unit;
      const target = attackerAct.params.target;
      
      // Check if target is also attacking attacker (Clash)
      if (defenderAct && defenderAct.type === ActionType.ATTACK && defenderAct.params.target === attacker) {
        // Clash
        if (attackerAct.token > defenderAct.token) {
          unitsDamaged.add(defenderAct.unit);
          damageSources.set(defenderAct.unit, attacker);
          this.players[attacker.playerId].score += 5; // Clash win bonus
          results.push(`${attacker.id} wins clash against ${defenderAct.unit.id} (+5 pts)`);
        } else if (attackerAct.token < defenderAct.token) {
          unitsDamaged.add(attacker);
          damageSources.set(attacker, defenderAct.unit);
          this.players[defenderAct.unit.playerId].score += 5; // Clash win bonus
          results.push(`${defenderAct.unit.id} wins clash against ${attacker.id} (+5 pts)`);
        } else {
          unitsDamaged.add(attacker);
          unitsDamaged.add(defenderAct.unit);
          damageSources.set(attacker, defenderAct.unit);
          damageSources.set(defenderAct.unit, attacker);
          results.push(`Mutual destruction in clash between ${attacker.id} and ${defenderAct.unit.id}`);
        }
        return true; // Handled as clash
      }
      
      // Normal attack
      if (attackerAct.token >= CONFIG.attack_threshold) {
        unitsDamaged.add(target);
        damageSources.set(target, attacker);
        this.players[attacker.playerId].score += 2; // Damage bonus
        results.push(`${attacker.id} hits ${target.id} (+2 pts)`);
      } else {
        results.push(`${attacker.id} misses ${target.id} (Power ${attackerAct.token} < 3)`);
      }
      return false;
    };

    let p0ClashHandled = false;
    let p1ClashHandled = false;

    if (p0Act && p0Act.type === ActionType.ATTACK) {
      if (p1Act && p1Act.type === ActionType.ATTACK && p1Act.params.target === p0Act.unit) {
        p0ClashHandled = resolveAttack(p0Act, p1Act);
        p1ClashHandled = true; 
      } else {
        resolveAttack(p0Act, null);
      }
    }

    if (p1Act && p1Act.type === ActionType.ATTACK && !p1ClashHandled) {
       resolveAttack(p1Act, null);
    }

    // Apply damage
    unitsDamaged.forEach(u => {
      if (u.takeDamage()) {
        unitsToKill.add(u);
        results.push(`${u.id} destroyed.`);
        
        if (u.props.is_commander) {
            const attacker = damageSources.get(u);
            this.winningEvent = { type: 'assassination', victim: u, attacker: attacker };
        }

        const killerId = u.playerId === 0 ? 1 : 0;
        const points = u.props.is_commander ? 50 : 10;
        this.players[killerId].score += points;
        results.push(`Player ${killerId + 1} gains ${points} points.`);
      }
    });

    unitsToKill.forEach(u => this.board.removeUnit(u));

    // 2. Resolve Moves
    const moveRequests = [];
    [p0Act, p1Act].forEach(act => {
      if (act && act.type === ActionType.MOVE && act.unit.health > 0) {
        let nr, nc;
        if (act.params.target) {
          nr = act.params.target.r;
          nc = act.params.target.c;
        } else {
          const { dr, dc } = act.params.direction;
          nr = act.unit.row + (dr * act.unit.props.movement);
          nc = act.unit.col + (dc * act.unit.props.movement);
        }
        
        if (nr >= 0 && nr < this.board.size && nc >= 0 && nc < this.board.size) {
           moveRequests.push({ unit: act.unit, nr, nc });
        }
      }
    });

    // Validate Moves (Burn Logic & Friendly Fire)
    const validMoves = [];
    const movingUnitsSet = new Set(moveRequests.map(m => m.unit));

    moveRequests.forEach(req => {
      // Check path (Jumping enemies forbidden, jumping friendlies allowed)
      const pathClear = this.board.pathClear(req.unit, req.nr, req.nc, movingUnitsSet);
      
      // Check destination occupancy (at start of turn)
      const destOccupant = this.board.getUnitAt(req.nr, req.nc);
      
      // Burn Logic: If path blocked by enemy OR dest blocked by enemy (stationary), move fails but counts.
      // Friendly Logic: If dest blocked by friendly, move fails (Friendly fire forbidden).
      
      let blocked = !pathClear;
      if (destOccupant && !movingUnitsSet.has(destOccupant)) {
          // Destination is occupied by a stationary unit
          blocked = true;
          // Note: If it's an enemy, we might collide? "When moving on a stationary both will be eliminated"
          // So if destOccupant is enemy, it's NOT blocked, it's a collision course!
          if (destOccupant.playerId !== req.unit.playerId) {
              blocked = false; // Allow move to proceed to collision logic
          }
      }

      if (blocked) {
        results.push(`${req.unit.id} move blocked (Burned).`);
      } else {
        validMoves.push(req);
      }
    });

    // Destination Collision Check
    const destMap = new Map(); // "r,c" -> [unit]
    
    // Add moving units to map
    validMoves.forEach(req => {
      const key = `${req.nr},${req.nc}`;
      if (!destMap.has(key)) destMap.set(key, []);
      destMap.get(key).push(req.unit);
    });

    // Add stationary units to map (if they are being landed on)
    validMoves.forEach(req => {
        const key = `${req.nr},${req.nc}`;
        const stationary = this.board.getUnitAt(req.nr, req.nc);
        if (stationary && !movingUnitsSet.has(stationary)) {
            // Check if already added (shouldn't be, as map is new)
            const list = destMap.get(key);
            if (!list.includes(stationary)) list.push(stationary);
        }
    });

    destMap.forEach((units, key) => {
      const [r, c] = key.split(',').map(Number);
      if (units.length === 1) {
        // Single unit moves successfully
        const u = units[0];
        const req = validMoves.find(m => m.unit === u);
        if (req) {
            this.board.moveUnit(u, r, c);
            results.push(`${u.id} moved to (${r}, ${c}).`);
        }
      } else {
        // Collision: Resolve based on types and "Strategos Exception"
        const p0Units = units.filter(u => u.playerId === 0);
        const p1Units = units.filter(u => u.playerId === 1);
        
        if (p0Units.length > 0 && p1Units.length > 0) {
            // Enemy Collision
            const eliminated = new Set();
            
            // Strategos Exception check
            const movingStrategos = units.filter(u => u.type === 'Strategos' && movingUnitsSet.has(u));
            const enemiesOfMovingStrategos = units.filter(u => {
                if (u.type === 'Strategos') return false;
                return movingStrategos.some(ms => ms.playerId !== u.playerId);
            });

            if (movingStrategos.length > 0 && enemiesOfMovingStrategos.length > 0) {
                // Strategos Exception applies: Strategos dies, Scout survives.
                movingStrategos.forEach(ms => eliminated.add(ms));
                results.push("Strategos Exception: Player who moved Strategos into enemy loses the Strategos.");
            }

            // Braced Rule & General Collision
            units.forEach(u => {
                if (eliminated.has(u)) return;
                const isMoving = movingUnitsSet.has(u);
                const stationaryEnemies = units.filter(other => other.playerId !== u.playerId && !movingUnitsSet.has(other));
                const movingEnemies = units.filter(other => other.playerId !== u.playerId && movingUnitsSet.has(other));

                if (isMoving) {
                    if (stationaryEnemies.length > 0) {
                        // Moving unit lands on stationary enemy (Braced)
                        if (u.type !== 'Strategos') {
                            eliminated.add(u);
                            stationaryEnemies.forEach(se => eliminated.add(se));
                            results.push(`${u.id} collided with stationary enemy. Both eliminated.`);
                        }
                    } else if (movingEnemies.length > 0) {
                        // Both moving to same tile
                        if (u.type !== 'Strategos') {
                            movingEnemies.forEach(me => {
                                if (me.type !== 'Strategos') {
                                    eliminated.add(u);
                                    eliminated.add(me);
                                }
                            });
                        } else {
                            // Moving Strategos into moving enemy is already handled or Strategos dies
                            eliminated.add(u);
                        }
                    }
                }
            });

            // Final elimination
            eliminated.forEach(u => {
                u.health = 0;
                this.board.removeUnit(u);
            });
        } else {
            // Friendly Collision: Bounce back (no movement)
            results.push("Friendly collision! Moves cancelled.");
        }
      }
    });

    // 3. Claims
    [p0Act, p1Act].forEach(act => {
      if (act && act.type === ActionType.CLAIM && act.unit.health > 0) {
        if (this.board.isCoreCell(act.unit.row, act.unit.col)) {
           this.players[act.unit.playerId].score += 3; // Claim bonus
           results.push(`${act.unit.id} claims core position (+3 pts).`);
        }
      }
    });

    this.currentSlot++;
    
    if (!this.winner) {
      this.checkWinConditions();
    }

    if (this.currentSlot >= 5 && !this.winner) {
      this.endRound();
    }

    return { slotIdx, results };
  }

  endRound() {
    // Cumulative scoring for core control
    this.players.forEach(p => {
      const corePoints = this.getCorePoints(p.id);
      p.score += corePoints;
      if (corePoints > 0) {
        this.log(`Player ${p.id + 1} gained ${corePoints} core points.`);
      }
    });

    this.players.forEach(p => {
      this.actingUnits.forEach(u => {
        if (u.playerId === p.id) u.fatigueUntilRound = this.round + 1;
      });
      p.resetTokens();
    });
  
    this.round++;
    this.timeline = Array(5).fill(null).map(() => [null, null]);
    this.phase = 'planning';
    this.currentSlot = 0;
    this.currentPlayerId = 0; // or alternate? we'll keep P1 starting
    this.actingUnits.clear();
  
    // Check win conditions again (in case core points threshold met after scoring)
    this.checkWinConditions();
  
    if (!this.winner) {
      this.log(`Round ${this.round + 1} started.`);
    }
  }

  // AI Logic
  serialize() {
    return {
      board: this.board.grid.map(row => row.map(cell => cell ? {
        unit: {
          id: cell.id,
          type: cell.type,
          owner: cell.playerId,
          hp: cell.health,
          fatigue: cell.fatigueUntilRound
        }
      } : null)),
      units: this.units.map(u => ({
        id: u.id,
        type: u.type,
        owner: u.playerId,
        r: u.r,
        c: u.c,
        hp: u.hp,
        fatigue: u.fatigue
      })),
      players: this.players.map(p => ({
        id: p.id,
        score: p.score,
        tokens: p.tokens.filter(t => !p.usedTokens.has(t))
      })),
      round: this.round,
      currentSlot: this.currentSlot,
      phase: this.phase,
      validMoves: this.getValidMovesForAI(1) // Helper to send valid moves to AI
    };
  }

  getValidMovesForAI(playerId) {
    const player = this.players[playerId];
    // Filter units that already acted in current timeline
    const actedUnits = new Set();
    this.timeline.forEach(([a0, a1]) => {
      if (a0 && a0.unit.playerId === playerId) actedUnits.add(a0.unit);
      if (a1 && a1.unit.playerId === playerId) actedUnits.add(a1.unit);
    });

    const activeUnits = player.getActiveUnits(this.round).filter(u => !actedUnits.has(u));
    const availableTokens = player.tokens.filter(t => !player.usedTokens.has(t));
    
    if (activeUnits.length === 0 || availableTokens.length === 0) return [];

    const moves = [];
    activeUnits.forEach(unit => {
      const possible = this.getPossibleActions(unit);
      
      // Move Actions
      possible.move.forEach(dest => {
        availableTokens.forEach(token => {
           moves.push({
             unitId: unit.id,
             tokenId: token,
             type: 'move',
             target: dest
           });
        });
      });

      // Attack Actions
      possible.attack.forEach(target => {
        availableTokens.forEach(token => {
           moves.push({
             unitId: unit.id,
             tokenId: token,
             type: 'attack',
             target: target
           });
        });
      });
      
      // Claim Actions
      if (possible.claim) {
         availableTokens.forEach(token => {
           moves.push({
             unitId: unit.id,
             tokenId: token,
             type: 'claim'
           });
        });
      }
    });
    return moves;
  }

  executeRemoteMove(move) {
    if (!move) return false;
    
    const unit = this.units.find(u => u.id === move.unitId);
    if (!unit) return false;
    
    const token = move.tokenId; // ID or string?
    // In engine, tokens are strings like 'move', 'attack' or just generic tokens?
    // In Player class: this.tokens = ['T1', 'T2', ...]
    
    const params = {};
    if (move.target) params.target = move.target;
    
    return this.placeAction(unit.playerId, this.currentSlot, token, unit, move.type, params);
  }

  aiMove(playerId) {
    const player = this.players[playerId];
    
    // Filter units that already acted in current timeline
    const actedUnits = new Set();
    this.timeline.forEach(([a0, a1]) => {
      if (a0 && a0.unit.playerId === playerId) actedUnits.add(a0.unit);
      if (a1 && a1.unit.playerId === playerId) actedUnits.add(a1.unit);
    });

    const activeUnits = player.getActiveUnits(this.round).filter(u => !actedUnits.has(u));
    
    if (activeUnits.length === 0) {
      // Must pass? Or just pick a random token and do nothing?
      // Game rules don't specify pass. Assuming we must pick a token and waste it if no units.
      // But let's try to find a valid move.
      // If no units can act, we might just skip turn or place a dummy action.
      // For now, let's just pick a random token and a random unit (even if fatigued, though canAct filters them)
      // If absolutely no units, we can't place.
      return false;
    }

    const unit = activeUnits[Math.floor(Math.random() * activeUnits.length)];
    const possible = this.getPossibleActions(unit);
    const types = [];
    if (possible.move.length) types.push('move');
    if (possible.attack.length) types.push('attack');
    if (possible.claim) types.push('claim');

    if (types.length === 0) return false; // Should not happen if unit is active usually

    const type = types[Math.floor(Math.random() * types.length)];
    
    const availableTokens = player.tokens.filter(t => !player.usedTokens.has(t));
    if (availableTokens.length === 0) return false;
    const token = availableTokens[Math.floor(Math.random() * availableTokens.length)];
    
    let params = {};
    if (type === 'move') {
      const dest = possible.move[Math.floor(Math.random() * possible.move.length)];
      params.target = dest;
    } else if (type === 'attack') {
      params.target = possible.attack[Math.floor(Math.random() * possible.attack.length)];
    }

    return this.placeAction(playerId, this.currentSlot, token, unit, type, params);
  }
}
