import { assertForOfStatement } from 'babel-types';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as HttpStatus from 'http-status-codes';
import * as path from 'path';
import * as env from '../env';
import { league_get_all_route, league_route, team_route, user_route } from './constants/routes';
import { api_delete_request, api_get_multiple_requests,  api_get_request, api_post_request,
     api_put_request, create_cookie, generate_auth_token, generate_get_route, is_logged_in } from './helpers/routing';

const app = express();
const DEFAULT_PORT = 3001;
const port = (env as any).env.PORT || DEFAULT_PORT;
const backend_location = (env as any).env.BACKEND_LOCATION;

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(__dirname));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // NOTE: If security is being implemented, a secret can be passed here.

const errors = [];

app.get('/', (req, res) => {
    is_logged_in(req.cookies, (user_object) => {

        api_get_request(backend_location + league_get_all_route, (all_leagues) => {
            const leagues = [];
            all_leagues.forEach((league) => {
                if (league.Owner === user_object._id) {
                    leagues.push({ name: league.Name, id: league._id });
                }
            });

            res.render('home', {
                leagues,
            });
        });
    }, (failure) => {
        res.redirect('/login');
    });
});

app.get('/league/:id', (req,res) => {

    is_logged_in(req.cookies, (success) => {
        // this value ensures the HTML page is rendered before variables are used
        const route = backend_location + generate_get_route(league_route, { id: req.params.id });
        api_get_request(route, (league_object) => {
            const page_rendered=true;
            if(league_object._id === req.params.id) {
                // TODO: getting a league object SHOULD return a list of teams, tournaments and matches
                const league = {
                    _id: league_object._id,
                    description: league_object.Description,
                    game_type: league_object.Game_type,
                    name: league_object.Name,
                };
                const tournaments = [];
                // You should be able to add a team into this list from your DB and then
                // View that team by clicking on the team object in the league page.
                const teams = [];
                const matches = [];
                res.render('leagues', {
                    league,
                    matches,
                    page_rendered,
                    teams,
                    tournaments,
                });
            }

        });

    }, (failure) => {
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        res.redirect('/');
    }, (failure) => {
        console.log(errors);
        res.render('login', {
            errors,
        });
        errors.pop();
    });
});

app.get('/signup', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        res.redirect('/');
    }, (failure) => {
        res.render('signup');
    });
});

app.get('/team/:id', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const route = backend_location + generate_get_route(team_route, { id: req.params.id });
        api_get_request(route, (team_object) => {
            if(team_object._id === req.params.id) {
                const owner_route = backend_location + generate_get_route(user_route, {id: team_object.Owner});
                api_get_request(owner_route, (owner_object) =>  {
                        const team = {
                            _id: team_object._id,
                            description: team_object.Description,
                            name: team_object.Name,
                            roster: team_object.Roster,
                        };
                        if (owner_object._id === team_object.Owner) {
                            const page_rendered=true;
                            const owner = {
                                _id: owner_object._id,
                                email: owner_object.email,
                                name: owner_object.displayName,
                            };

                            res.render('team', {
                                owner,
                                page_rendered,
                                team,
                            });
                        }
                });
            }
        });
    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/add_team', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const teamName = req.body.teamName;
        const teamDescription = req.body.teamDescription;
        const ownerEmail = req.body.teamOwnerEmail;
        const textRoster = req.body.teamRoster;
        const leagueId = req.body.leagueId;

        if (!(teamName && teamDescription && ownerEmail && textRoster)) {
            // TODO: When frontend error handling is implemented, report this error.
            res.redirect('back');
            return;
        }

        const teamRoster = (textRoster as string).split(',').map((item) => item.trim());

        // Get the userID for the email.
        const route = backend_location + generate_get_route(user_route, { email: ownerEmail });
        api_get_request(route, (user_object) => {
            if (!user_object || !user_object._id || !user_object.email || !user_object.displayName) {
                // User wasn't valid.
                // TODO: When possible, pass that info along.
                res.redirect('back');
                return;
            }

            const payload = {
                Description: teamDescription,
                League: leagueId,
                Name: teamName,
                Owner: user_object._id,
                Roster: teamRoster,
            };
            api_post_request(backend_location, team_route, payload, (backend_response) => {
                if (backend_response) {
                    if (backend_response.status_code === HttpStatus.OK) {
                        // Redirect the user so that the new team appears.
                        res.redirect('back');
                        return;
                    }
                }

                // Error case handled here, all success cases above should have returned.
                // TODO: When we have front-end error handling, it should be reported here.
                res.redirect('/');
            });

        });

    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/create_league', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const ownerId = success._id;
        const name = req.body.leagueName ? req.body.leagueName : '';
        const description = req.body.leagueDescription ? req.body.leagueDescription : '';
        const gameType = req.body.leagueGameType ? req.body.leagueGameType : '';

        const payload = {
            Description: description,
            Game_type: gameType,
            Name: name,
            Owner: ownerId,
        };

        api_post_request(backend_location, league_route, payload, (backend_response) => {
            if (backend_response) {
                if (backend_response.status_code === HttpStatus.OK) {
                    // Redirect the user so that the new league appears.
                    res.redirect('/');
                    return;
                }
            }

            // Error case handled here, all success cases above should have returned.
            // TODO: When we have front-end error handling, it should be reported here.
            res.redirect('/');
        });
    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/delete_league', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const leagueId = req.body.leagueId ? req.body.leagueId : '';

        api_delete_request(generate_get_route(backend_location + league_route, { id: leagueId }), (backend_response) => {
            if (backend_response) {
                if (backend_response.status_code === HttpStatus.OK) {
                    // Redirect the user so that the changes appear.
                    res.redirect('/'); // Go back to home
                }
            }
        });

    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/edit_league', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const leagueOwner = success._id;
        const leagueName = req.body.leagueName;
        const leagueDescription = req.body.leagueDescription;
        const leagueGameType = req.body.leagueGameType;
        const leagueId = req.body.leagueId ? req.body.leagueId : '';

        if (!leagueName || !leagueDescription || !leagueGameType || !leagueId) {
            // TODO: When we have front-end error handling, it should be reported here.
            res.redirect('back'); // Go back to the refferer.
        }

        const payload = {
            Description: leagueDescription,
            Game_type: leagueGameType,
            Name: leagueName,
            Owner: leagueOwner,
        };

        api_put_request(generate_get_route(backend_location + league_route, { id: leagueId }), payload, (backend_response) => {
            if (backend_response) {
                if (backend_response.status_code === HttpStatus.OK) {
                    // Redirect the user so that the changes appear.
                    res.redirect('back'); // Go back to the refferer.
                }
            }
        });

    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/edit_team', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        const teamOwner = success._id;
        const teamName = req.body.teamName;
        const teamDescription = req.body.teamDescription;
        const textRoster = req.body.teamRoster;
        const teamId = req.body.teamId ? req.body.teamId : '';

        if (!teamName || !teamDescription || !textRoster || !teamId) {
            // TODO: When we have front-end error handling, it should be reported here.
            res.redirect('back'); // Go back to the refferer.
        }
        const teamRoster = (textRoster as string).split(',').map((item) => item.trim());

        const payload = {
            Description: teamDescription,
            Name: teamName,
            Owner: teamOwner,
            Roster: teamRoster,
        };

        api_put_request(generate_get_route(backend_location + team_route, { id: teamId }), payload, (backend_response) => {
            if (backend_response) {
                if (backend_response.status_code === HttpStatus.OK) {
                    // Redirect the user so that the changes appear.
                    res.redirect('back'); // Go back to the refferer.
                }
            }
        });

    }, (failure) => {
        res.redirect('/login');
    });
});

app.post('/login', (req, res) => {
    is_logged_in(req.cookies, (success) => {
        // User is already logged in, so ignore their request.
    }, (failure) => {
        // Check for no body, and for string versions of falsey things.
        if (!req.body.username || req.body.username === 'undefined' || req.body.username === 'null') {
            res.redirect('/login');
            return;
        }

        const username = req.body.username;
        const route = backend_location + generate_get_route(user_route, { displayName: username });

        api_get_request(route, (user_object) => {
            if (!user_object || !user_object._id || !user_object.email || !user_object.displayName) {
                // User wasn't valid.
                // When possible, pass that info along.
                console.log(user_object.error);
                errors.push(user_object.error);
                res.redirect('/login');
                return;
            }

            const id = user_object._id;
            const email = user_object.email;
            const name = user_object.displayName;
            const random_number = Math.random();

            // Attach a "security random number" (srn)
            // the user's auth token, and their username
            // to the browser.
            create_cookie('tourneygen_srn', random_number, res);
            create_cookie('tourneygen_auth', generate_auth_token(id, email, name, random_number), res);
            create_cookie('tourneygen_user', name , res);

            // Send user to their home page.
            // GH-9 should handle this.
            res.redirect('/');
        });
    });
});

app.post('/signup', async (req, res) => {

    const username = req.body.username ? req.body.username : '';
    const email = req.body.email ? req.body.email : '';
    const route =  (env as any).env.BACKEND_LOCATION;
    const url_path = '/Api/user';
    const body = {
        displayName : username,
        email,
    };

    api_post_request(route, url_path, body, (user_object) => {
        if (user_object && user_object.status_code === HttpStatus.OK) {
            res.redirect('/login');
        } else {
            res.redirect('/signup');
        }
    });
});

app.listen(port,() => {
    return console.info(`Server is listening on port ${port}`);
});
