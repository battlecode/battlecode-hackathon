import * as Inferno from 'inferno';
import Component from 'inferno-component';

import { TOP_BAR_HEIGHT } from '../constants';
import { ActiveGameInfo } from '../types';
import { ActiveGame } from './active-game';

interface Props extends Inferno.Props {
    games: ActiveGameInfo[];
}

export class ActiveGamesList extends Component<{}, {}> {
    
    render() {
        return (
            <div class="active-games-list" style={{top: TOP_BAR_HEIGHT}}>
                {this.props.games.map((game) => (
                    <ActiveGame game={game} key={game.gameID} />
                ))}
            </div>
        );
    }

}
