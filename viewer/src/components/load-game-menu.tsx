import * as Inferno from 'inferno';
import Component from 'inferno-component';

export class LoadGameMenu extends Component<{}, {}> {

    render() {
        return (
            <div className="dialog">
                Let's make a new game or something.
            </div>
        );
    }

}
