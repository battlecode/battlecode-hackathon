import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    replays: String[];
    loadReplay: (replay: string) => void;
}

export class LoadGameMenu extends Component<{}, {}> {

    onClick = () => {
        this.props.createGame('blah');
    }

    render() {
        return (
            <div className="dialog blue">
                <div>
                    Replay:
                    <select>
                        {this.props.replays.map((replay) => (
                            <option value={replay}>{replay}</option>
                        ))}
                    </select>
                </div>
                <button 
                    className="blue"
                    onClick={this.onClick}
                >Load my game!</button>
            </div>
        );
    }

}
