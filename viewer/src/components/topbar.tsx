import * as Inferno from 'inferno';
import Component from 'inferno-component';

import { TOP_BAR_HEIGHT } from '../constants';
import { DialogButton } from './dialog-button';
import { NewGameMenu } from './new-game-menu';
import { LoadGameMenu } from './load-game-menu';
import { ViewerSettingsMenu } from './viewer-settings-menu';
import { Timeline } from './timeline';

interface Props extends Inferno.Props {
    maps: string[];
    createGame: (map: string) => void;
    replays: string[];
    loadReplay: (replay: string) => void;
    currentRound: number;
    farthestRound: number;
    maxRound: number;
    changeRound: (number) => void;
    turnsPerSecond: number;
    isPlaying: boolean;
    togglePlaying: () => void;
    togglePlaybackRate: () => void;
}

interface State {
    active: boolean[];
}

export class TopBar extends Component<{}, State> {

    state: State;

    constructor() {
        super();
        this.state = {
            active: [false, false, false],
        }
    }

    deselectAllExceptToggle = (i: number) => {
        let newActive = [false, false, false];
        if (i != -1) {
            newActive[i] = !this.state.active[i];
        }
        this.setState({
            active: newActive,
        });
    }

    render() {
        return (
            <div class="top-bar" style={`height: ${TOP_BAR_HEIGHT}px;`}>
                <div style="height: 5px; width: 25px; float: left;" />
                <DialogButton
                    active={this.state.active[0]}
                    idx={0}
                    color="green"
                    label="New game"
                    xOffset={25}
                    deselectAllExceptToggle={this.deselectAllExceptToggle}
                >
                    <NewGameMenu maps={this.props.maps} createGame={this.props.createGame} />
                </DialogButton>
                <DialogButton
                    active={this.state.active[1]}
                    idx={1}
                    color="blue"
                    label="Load game"
                    xOffset={175}
                    deselectAllExceptToggle={this.deselectAllExceptToggle}
                >
                    <LoadGameMenu replays={this.props.replays} loadReplay={this.props.loadReplay} />
                </DialogButton>
                <DialogButton
                    active={this.state.active[2]}
                    idx={2}
                    color="red"
                    label="Viewer controls"
                    xOffset={325}
                    deselectAllExceptToggle={this.deselectAllExceptToggle}
                >
                    <ViewerSettingsMenu 
                        currentRound={this.props.currentRound}
                        maxRound={this.props.maxRound}
                        turnsPerSecond={this.props.turnsPerSecond}
                        isPlaying={this.props.isPlaying}
                        togglePlaying={this.props.togglePlaying}
                        togglePlaybackRate={this.props.togglePlaybackRate}
                    />
                </DialogButton>
                <Timeline
                    currentRound={this.props.currentRound}
                    farthestRound={this.props.farthestRound}
                    maxRound={this.props.maxRound}
                    changeRound={this.props.changeRound}
                />
            </div>
        );
    }

}
