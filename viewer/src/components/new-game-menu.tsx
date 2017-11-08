import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    maps: String[];
    createGame: (map: string) => void;
}

export class NewGameMenu extends Component<{}, {}> {

    onClick = () => {
        this.props.createGame('blah');
    }

    render() {
        return (
            <div className="dialog green">
                <div>
                    Map:
                    <select>
                        {this.props.maps.map((map) => (
                            <option value={map}>{map}</option>
                        ))}
                    </select>
                </div>
                <button 
                    className="green"
                    onClick={this.onClick}
                >Create my game!</button>
            </div>
        );
    }

}
