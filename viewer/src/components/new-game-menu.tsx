import * as Inferno from 'inferno';
import Component from 'inferno-component';

interface Props extends Inferno.Props {
    maps: String[];
}

export class NewGameMenu extends Component<{}, {}> {

    render() {
        return (
            <div className="dialog">
                Let's make a new game or something.
                <select>
                    {this.props.maps.map((map) => (
                        <option value={map}>{map}</option>
                    ))}
                </select>
            </div>
        );
    }

}
