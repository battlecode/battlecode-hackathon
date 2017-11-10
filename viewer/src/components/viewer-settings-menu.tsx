import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    currentRound: number;
    maxRound: number;
    turnsPerSecond: number;
    isPlaying: boolean;
    togglePlaying: () => void;
    togglePlaybackRate: () => void;
}

export class ViewerSettingsMenu extends Component<Props, {}> {

    onPlayingClick = () => {
        this.props.togglePlaying();
    }

    onSpeedClick = () => {
        this.props.togglePlaybackRate();
    }

    render() {
        return (
            <div className="dialog red">
                <div>
                    Round: {this.props.currentRound} / {this.props.maxRound}
                </div>
                <div>
                    Playback rate: {this.props.turnsPerSecond} turns/s
                </div>
                <button 
                    className="red thin"
                    onClick={this.onPlayingClick}
                >
                    {this.props.isPlaying ? "Pause" : "Play"}
                </button>
                <button 
                    className="red thin"
                    onClick={this.onSpeedClick}
                >
                    Change speed
                </button>
            </div>
        );
    }

}
