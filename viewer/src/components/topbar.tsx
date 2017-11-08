import * as Inferno from 'inferno';
import Component from 'inferno-component';

import { TOP_BAR_HEIGHT } from '../constants';
import { DialogButton } from './dialog-button';
import { LoadGameMenu } from './load-game-menu';
import { NewGameMenu } from './new-game-menu';
import { Timeline } from './timeline';

export class TopBar extends Component<{}, {}> {

    render() {
        return (
            <div class="top-bar" style={`height: ${TOP_BAR_HEIGHT}px;`}>
                <DialogButton color="green" label="New game" xOffset={0}>
                    <NewGameMenu maps={['mars', 'earth', 'neptune']} />
                </DialogButton>
                <DialogButton color="blue" label="Load game" xOffset={150}>
                    <LoadGameMenu />
                </DialogButton>
                <DialogButton color="red" label="Something else" xOffset={300} />
                <Timeline currentRound={500} farthestRound={1000} maxRound={2000} />
            </div>
        );
    }

}
