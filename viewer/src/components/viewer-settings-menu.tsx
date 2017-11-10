import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    isPlaying: boolean;
    togglePlaying: () => void;
}

export class ViewerSettingsMenu extends Component<Props, {}> {

    onClick = () => {
        this.props.togglePlaying();
    }

    render() {
        return (
            <div className="dialog red">
                <div>
                    Viewer settings
                </div>
                <button 
                    className="red"
                    onClick={this.onClick}
                >
                    {this.props.isPlaying ? "Pause" : "Play"}
                </button>
            </div>
        );
    }

}
