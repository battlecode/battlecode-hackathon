import { SectorData, EntityID, EntityData, TeamID, Location } from './schema';
import * as _ from 'lodash';

export class Sector {
    teams: Map<TeamID, EntityID[]>;
    topLeft_: Location;
    controllingTeam_: TeamID;
    hasChanged: boolean;

    constructor(topLeft: Location) {
       this.teams = new Map();
       this.topLeft_ = topLeft;
       // by default, 'neutral' controls this sector
       this.controllingTeam_ = 0;
       this.hasChanged = false;
    }

    /**
    * Get or create new EntityID[] of statues if team does not exist in teams
    */
    getOrCreateTeam(team: TeamID): EntityID[]{
        if (!this.teams.has(team)) {
            this.teams.set(team, []);
        }
        return this.teams.get(team) as EntityID[];
    }

    getTeam(id: TeamID){
        var team = this.teams.get(id);
        if (!team) {
            throw new Error("Nonexistent team in sector"+id);
        }
        return team;
    }

    addStatue(statue: EntityData) {
       var team = this.getOrCreateTeam(statue.teamID);
       if (team.indexOf(statue.id) > -1) {
           throw new Error("Statue already exists in Sector"+statue.id);
       }
       team.push(statue.id);
       this.updateControllingTeam();
    }

    deleteStatue(statue: EntityData) {
        
        var team = this.getTeam(statue.teamID); 
        var index = team.indexOf(statue.id);
        if (index < 0) {
            throw new Error("Can't delete nonexistent statue from sector"+statue.id);
        }
        team.splice(index, 1);
        this.updateControllingTeam();
    }

    /**
    * returns id of team controlling sector or -1 if no team controlling
    */
    getControllingTeamID(): TeamID {
        var control = 0;
        for (var teamID of this.teams.keys()) {
            var team = this.getTeam(teamID);
            if (team.length > 0) {
                if (control == 0) {
                    control = teamID;
                } else {
                    control = 0;
                    break;
                }
            }
        }
        return control;
    }
    
    updateControllingTeam() {
        var newControllingTeam = this.getControllingTeamID()
        if (this.controllingTeam_ != newControllingTeam) {
            this.controllingTeam_ = newControllingTeam;
            this.hasChanged = true;
        }
    }

    /**
     * returns true when team controlling sector changes 
     */
    checkChanged(): boolean {
        if (this.hasChanged) {
            this.hasChanged = false;
            return true;
        }
        return false;
    }

    /**
     * returns id of oldest statue from team, or -1 if no statue exists
     * oldest statue is statue with lowest id 
     */
    getOldestStatueID(team: TeamID): EntityID | undefined {
        if (!this.teams.has(team)) {
            return undefined;
        }

        var oldest: EntityID | undefined = undefined;
        for (var statue of this.getTeam(team)) {
            if (oldest === undefined || statue < oldest) {
                oldest = statue;
            }
        }
        return oldest;
    }
    
    /**
    * returns id of spawning statue from controlling team, if one exists
    */
    getSpawningStatueID(): EntityID | undefined {
        return this.getOldestStatueID(this.controllingTeam_);
    }

    static getSectorData(sector: Sector): SectorData {
        var data: SectorData = {
            topLeft: sector.topLeft_,
            controllingTeamID: sector.controllingTeam_
        }
        return _.cloneDeep(data)
    }
}