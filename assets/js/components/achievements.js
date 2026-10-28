import { incrementAchievementCounter } from '../modules/achievement_progress.js';

class Achievement {
    constructor(name, description, key, hide, counter, threshold) {
        this.name = name;
        this.description = description;
        this.key = key;
        this.hide = hide;
        this.counter = counter;
        this.threshold = threshold;
        this.solved = !!localStorage.getItem("achievement_" + key);

        if (!this.solved) {
            this.test();
        }
    }

    test(value = localStorage.getItem(this.counter)) {
        if (Number(value) >= this.threshold) this.unlock();
    }

    unlock() {
        if (!this.solved) {
            this.solved = true;
            localStorage.setItem("achievement_" + this.key, new Date());
            this.show_popup();
        }
    }

    show_popup() {
        let container = document.createElement("div");
        container.classList.add("popup");

        let close = document.createElement("span");
        close.innerText = "×";
        close.addEventListener("click", () => {
            container.classList.add("hidden");
        })

        let help = document.createElement("span");
        help.innerText = "?";
        help.addEventListener("click", () => {
            let lang = document.location.pathname.split("/")[1];
            let origin = document.location.origin;
            let p = `${origin}/${lang}/achievements`;
            window.location = p;
        });

        let headline = document.createElement("h2");
        headline.innerText = this.name;
        let text = document.createElement("p");
        text.innerText = this.description;

        container.appendChild(close);
        container.appendChild(help);
        container.appendChild(headline);
        container.appendChild(text);
        const host = document.querySelector('.endgame-achievements') || document.body;
        host.appendChild(container);
        window.setTimeout(function() {
            container.classList.add("hidden");
        }, 15000);
    }

    div() {
        let container = document.createElement("div");
        if (this.hide && !this.solved) {
            return container;
        }
        container.classList.add("achievement_list_elem");
        if (!this.solved) {
            container.classList.add("achievement_unsolved");
        } else {
            container.classList.add("achievement_solved");
        }
        let headline = document.createElement("h2");
        headline.innerText = this.name;
        let text = document.createElement("p");
        text.innerText = this.description;

        container.appendChild(headline);
        container.appendChild(text);

        return container;
    }
}

class Konami extends Achievement {
    constructor() {
        super("Konami Code", "You know what to do.", "konami", false);
        this.cursor = 0;
    }

    test() {
        const KONAMI_CODE = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
        document.addEventListener('keydown', (e) => {
            this.cursor = (e.keyCode == KONAMI_CODE[this.cursor]) ? this.cursor + 1 : 0;
            if (this.cursor == KONAMI_CODE.length) this.unlock();
        });
    }
}

const counterAchievements = [
    { counter: 'achievements_total_visits', levels: [
        ['Newcomer', 'Visit multiple pages.', 'newcomer', false, 3]
    ] },
    { counter: 'achievements_tactics_solved', levels: [
        ['Tactics Solver', 'Solve 5 tactics', 'tacticsolver', false, 5],
        ['Advanced Tactics Solver', 'Solve 32 tactics', 'tacticsolver2', true, 32],
        ['Great Tactic Solver', 'Solve 256 tactics', 'tacticsolver3', true, 256]
    ] },
    { counter: 'achievements_lines_learned', levels: [
        ['Student', 'Learn 3 opening lines.', 'student', false, 3],
        ['Good Student', 'Learn 25 opening lines.', 'student2', true, 25],
        ['Great Student', 'Learn 100 opening lines.', 'student3', true, 100],
        ['Honor Student', 'Learn 500 opening lines.', 'student4', true, 500]
    ] },
    { counter: 'achievements_endgames_solved', levels: [
        ['Endgame Winner', 'Win 3 endgames against Stockfish', 'endgames', false, 3],
        ['Endgame Champion', 'Win 27 endgames against Stockfish', 'endgames2', true, 27],
        ['Endgame Winner', 'Win 81 endgames against Stockfish', 'endgames3', true, 81]
    ] },
    { counter: 'achievements_blind_tactics_solved', levels: [
        ['Blind Tactics', 'Solve 5 blind tactics', 'blindtactics', false, 5]
    ] }
];

class NewsReader extends Achievement {
    constructor() {
        super("News Reader", "Read a blog post.", "newsreader", false);
    }

    test() {
        if (window.location.pathname.indexOf("/blog") != -1) {
            this.unlock();
        }
    }
}

class NightOwl extends Achievement {
    constructor() {
        super("Night Owl", "Shouldn't you be asleep yet?", "nightowl", false);
    }

    test() {
        let date = new Date();
        let hour = date.getHours();
        if (hour >= 0 && hour <= 5) {
            this.unlock();
        }
    }
}


let achievements;

function renderAchievements() {
    const container = document.getElementById('achievement_container');
    if (container && achievements) container.replaceChildren(...achievements.map(achievement => achievement.div()));
}

function main() {
    if (!achievements) {
        incrementAchievementCounter('achievements_total_visits');
        achievements = counterAchievements.flatMap(({ counter, levels }) => levels.map(
            ([name, description, key, hide, threshold]) => new Achievement(name, description, key, hide, counter, threshold)
        ));
        achievements.push(new NewsReader(), new Konami(), new NightOwl());
    }
    renderAchievements();
}

document.addEventListener('achievement-counter-changed', event => {
    for (const achievement of achievements || []) {
        if (achievement.counter === event.detail.key) achievement.test(event.detail.value);
    }
    renderAchievements();
});

if (document.readyState === 'complete') main();
else window.addEventListener('load', main, { once: true });
document.addEventListener('phx:update', main);
