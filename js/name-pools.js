// name-pools.js
//
// Hand-curated name pools for opponent generation. One entry per
// country with ~30 first names and ~30 last names. Strives for a
// mix of realistic contemporary first names and very common last
// names for that country.
//
// Sources: Wikipedia "Most common given names in X" and "Most
// common surnames in X" pages, cross-referenced with public FIDE
// rating lists for plausibility.
//
// Phase C.3b expansion: 5–6x the pool size compared to the initial
// ~8 names per country shipped in C.2a. With ~900 unique
// (first × last) combinations per country and deduping at the
// field-generation level, repeats should be rare.
//
// If you ever need to add a country, just append a new entry. The
// system will also fall back to NAMES_FALLBACK for missing codes.

const NamePools = (() => {

  const POOLS = {

    NO: {
      first: [
        'Magnus', 'Aryan', 'Johan', 'Lars', 'Erik', 'Henrik', 'Sigurd', 'Aksel',
        'Bjørn', 'Håkon', 'Ivar', 'Kristian', 'Leif', 'Mats', 'Nils', 'Odd',
        'Pål', 'Ragnar', 'Sven', 'Tor', 'Ulf', 'Vegard', 'Arne', 'Einar',
        'Frode', 'Gunnar', 'Harald', 'Knut', 'Oskar', 'Trygve',
      ],
      last: [
        'Olsen', 'Hansen', 'Andersen', 'Nilsen', 'Carlsen', 'Berg', 'Halvorsen', 'Vik',
        'Johansen', 'Larsen', 'Pedersen', 'Jensen', 'Bakken', 'Fossheim', 'Lund', 'Haugen',
        'Strand', 'Svendsen', 'Solberg', 'Moe', 'Dahl', 'Kristiansen', 'Rasmussen', 'Knudsen',
        'Næss', 'Sæther', 'Bjørnstad', 'Thorsen', 'Wik', 'Eide',
      ],
    },

    FR: {
      first: [
        'Maxime', 'Étienne', 'Romain', 'Hugo', 'Léo', 'Antoine', 'Julien', 'Pierre',
        'Lucas', 'Thomas', 'Alexandre', 'Nicolas', 'Vincent', 'Matthieu', 'Guillaume', 'Rémi',
        'Clément', 'Florent', 'Benjamin', 'Bastien', 'Corentin', 'David', 'Fabien', 'Gabriel',
        'Jérôme', 'Kévin', 'Mathis', 'Nathan', 'Olivier', 'Quentin',
      ],
      last: [
        'Lefèvre', 'Bernard', 'Moreau', 'Petit', 'Roux', 'Dupont', 'Lemoine', 'Vidal',
        'Martin', 'Durand', 'Leroy', 'Girard', 'Bonnet', 'Dupuis', 'Fontaine', 'Mercier',
        'Lambert', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Robert',
        'Richard', 'Michel', 'Simon', 'Laurent', 'Thomas', 'Morel',
      ],
    },

    GB: {
      first: [
        'Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Thomas', 'James', 'William',
        'Noah', 'Leo', 'Arthur', 'Henry', 'Oscar', 'Archie', 'Jacob', 'Freddie',
        'Alfie', 'Daniel', 'Alexander', 'Theo', 'Logan', 'Ethan', 'Joshua', 'Mason',
        'Isaac', 'Benjamin', 'Lucas', 'Finley', 'Dylan', 'Jayden',
      ],
      last: [
        'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Davies', 'Roberts',
        'Evans', 'Thomas', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes',
        'Edwards', 'Green', 'Hall', 'Lewis', 'Harris', 'Clarke', 'Patel', 'Jackson',
        'Clark', 'Turner', 'Hill', 'Scott', 'Cooper', 'Ward',
      ],
    },

    US: {
      first: [
        'Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin', 'Lucas',
        'Henry', 'Theodore', 'Jack', 'Levi', 'Alexander', 'Jackson', 'Mateo', 'Daniel',
        'Michael', 'Mason', 'Sebastian', 'Ethan', 'Logan', 'Owen', 'Samuel', 'Jacob',
        'Asher', 'Aiden', 'John', 'Joseph', 'Wyatt', 'David',
      ],
      last: [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
        'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
        'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
        'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
      ],
    },

    DE: {
      first: [
        'Lukas', 'Finn', 'Leon', 'Jonas', 'Paul', 'Elias', 'Luis', 'Felix',
        'Noah', 'Maximilian', 'Ben', 'Matteo', 'Henry', 'Tim', 'Niklas', 'Emil',
        'Julian', 'David', 'Alexander', 'Oskar', 'Jakob', 'Fabian', 'Simon', 'Philipp',
        'Moritz', 'Vincent', 'Tobias', 'Lennard', 'Adrian', 'Florian',
      ],
      last: [
        'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
        'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf',
        'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann',
        'Lange', 'Schmitt', 'Werner', 'Krause', 'Lehmann', 'König',
      ],
    },

    NL: {
      first: [
        'Noah', 'Sem', 'Daan', 'Liam', 'Finn', 'Bram', 'Luuk', 'Milan',
        'Lucas', 'Levi', 'Thomas', 'James', 'Jesse', 'Jens', 'Thijs', 'Max',
        'Mees', 'Sam', 'Lars', 'Ruben', 'Stijn', 'Tim', 'Tijn', 'Jayden',
        'Jan', 'Pieter', 'Willem', 'Hendrik', 'Bas', 'Dirk',
      ],
      last: [
        'de Jong', 'Jansen', 'de Vries', 'van den Berg', 'Bakker', 'Janssen', 'Visser', 'Smit',
        'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks',
        'van Leeuwen', 'Dekker', 'Brouwer', 'de Wit', 'Dijkstra', 'Smits', 'de Graaf', 'van der Meer',
        'van der Linden', 'Kok', 'Jacobs', 'de Haan', 'Vermeulen', 'van den Broek',
      ],
    },

    RU: {
      first: [
        'Alexander', 'Dmitry', 'Maxim', 'Sergey', 'Andrey', 'Alexey', 'Artem', 'Ilya',
        'Kirill', 'Mikhail', 'Nikita', 'Daniil', 'Ivan', 'Egor', 'Vladimir', 'Roman',
        'Stanislav', 'Timur', 'Pavel', 'Evgeny', 'Konstantin', 'Grigory', 'Oleg', 'Yaroslav',
        'Viktor', 'Anton', 'Leonid', 'Fyodor', 'Ruslan', 'Boris',
      ],
      last: [
        'Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Petrov', 'Sokolov', 'Mikhailov',
        'Fedorov', 'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semenov', 'Egorov', 'Pavlov',
        'Kozlov', 'Stepanov', 'Nikolaev', 'Orlov', 'Andreev', 'Makarov', 'Nikitin', 'Zakharov',
        'Zaitsev', 'Solovyev', 'Borisov', 'Yakovlev', 'Grigoriev', 'Romanov',
      ],
    },

    IN: {
      first: [
        'Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
        'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Kabir', 'Arnav', 'Vivaan', 'Aarush',
        'Dhruv', 'Ved', 'Vihan', 'Ayush', 'Rudra', 'Daksh', 'Yash', 'Rohan',
        'Parth', 'Kiaan', 'Nirvaan', 'Samar', 'Arham', 'Divyansh',
      ],
      last: [
        'Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Mishra', 'Das',
        'Joshi', 'Chopra', 'Malhotra', 'Kapoor', 'Reddy', 'Iyer', 'Rao', 'Nair',
        'Menon', 'Pillai', 'Agarwal', 'Banerjee', 'Chatterjee', 'Mukherjee', 'Shah', 'Bhatt',
        'Desai', 'Pandey', 'Trivedi', 'Saxena', 'Bose', 'Ghosh',
      ],
    },

    CN: {
      first: [
        'Wei', 'Ming', 'Jie', 'Hao', 'Lei', 'Jun', 'Yong', 'Bin',
        'Xiang', 'Gang', 'Peng', 'Tao', 'Kai', 'Bo', 'Yi', 'Rui',
        'Zhi', 'Long', 'Feng', 'Qiang', 'Hui', 'Liang', 'Jian', 'Chao',
        'Hong', 'Yang', 'Xin', 'Cheng', 'Fei', 'Xu',
      ],
      last: [
        'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao',
        'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo',
        'He', 'Gao', 'Lin', 'Luo', 'Zheng', 'Liang', 'Xie', 'Song',
        'Tang', 'Han', 'Feng', 'Deng', 'Cao', 'Peng',
      ],
    },

    ES: {
      first: [
        'Hugo', 'Martín', 'Lucas', 'Daniel', 'Pablo', 'Mateo', 'Alejandro', 'Álvaro',
        'Adrián', 'David', 'Diego', 'Manuel', 'Javier', 'Gonzalo', 'Marcos', 'Iván',
        'Jorge', 'Miguel', 'Carlos', 'Antonio', 'Fernando', 'Rubén', 'Sergio', 'Raúl',
        'Víctor', 'Ignacio', 'Enrique', 'Óscar', 'Samuel', 'Andrés',
      ],
      last: [
        'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez',
        'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz',
        'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Vázquez',
        'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Molina',
      ],
    },

    PL: {
      first: [
        'Jakub', 'Szymon', 'Jan', 'Antoni', 'Aleksander', 'Franciszek', 'Filip', 'Mikołaj',
        'Wojciech', 'Stanisław', 'Kacper', 'Ignacy', 'Michał', 'Bartosz', 'Marcin', 'Piotr',
        'Paweł', 'Tomasz', 'Rafał', 'Adam', 'Dawid', 'Maciej', 'Krzysztof', 'Andrzej',
        'Damian', 'Kamil', 'Łukasz', 'Grzegorz', 'Jarosław', 'Sebastian',
      ],
      last: [
        'Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński',
        'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Kwiatkowski', 'Krawczyk',
        'Piotrowski', 'Grabowski', 'Nowakowski', 'Pawłowski', 'Michalski', 'Adamczyk', 'Dudek', 'Zając',
        'Wieczorek', 'Jabłoński', 'Król', 'Majewski', 'Olszewski', 'Jaworski',
      ],
    },

    UA: {
      first: [
        'Mykhailo', 'Vladyslav', 'Oleksandr', 'Artem', 'Nazar', 'Maksym', 'Danylo', 'Andriy',
        'Dmytro', 'Illia', 'Bohdan', 'Yaroslav', 'Volodymyr', 'Mykyta', 'Roman', 'Ihor',
        'Yurii', 'Vitalii', 'Oleh', 'Sergii', 'Vasyl', 'Mykola', 'Taras', 'Stepan',
        'Pavlo', 'Vadim', 'Kostiantyn', 'Yevhen', 'Vsevolod', 'Petro',
      ],
      last: [
        'Melnyk', 'Shevchenko', 'Boyko', 'Kovalenko', 'Bondarenko', 'Tkachenko', 'Kovalchuk', 'Kravchenko',
        'Oliinyk', 'Shevchuk', 'Koval', 'Polishchuk', 'Bondar', 'Tkachuk', 'Moroz', 'Marchenko',
        'Lysenko', 'Rudenko', 'Savchenko', 'Pavlenko', 'Romaniuk', 'Kravchuk', 'Chumak', 'Ivanenko',
        'Melnychuk', 'Havrylenko', 'Yurchenko', 'Zhuk', 'Hrytsenko', 'Panchenko',
      ],
    },

    AM: {
      first: [
        'Levon', 'Gabriel', 'Hrant', 'Robert', 'Karen', 'Tigran', 'Artur', 'Sergei',
        'Hayk', 'Davit', 'Armen', 'Grigor', 'Vahan', 'Ashot', 'Vardan', 'Aram',
        'Suren', 'Narek', 'Artyom', 'Gor', 'Samvel', 'Arman', 'Ruben', 'Karen',
        'Edgar', 'Khoren', 'Mher', 'Arthur', 'Vahagn', 'Nikolai',
      ],
      last: [
        'Aronian', 'Sargissian', 'Melkumyan', 'Hovhannisyan', 'Grigoryan', 'Petrosian', 'Babujian', 'Movsesian',
        'Karapetyan', 'Harutyunyan', 'Avetisyan', 'Khachatryan', 'Petrosyan', 'Ter-Petrosyan', 'Gevorgyan', 'Mkrtchyan',
        'Arutyunyan', 'Danielyan', 'Manukyan', 'Barseghyan', 'Galstyan', 'Muradyan', 'Asatryan', 'Hakobyan',
        'Gabrielyan', 'Hovakimyan', 'Simonyan', 'Tadevosyan', 'Vardanyan', 'Yeghiazaryan',
      ],
    },

    AZ: {
      first: [
        'Shakhriyar', 'Teimour', 'Vasif', 'Rauf', 'Eltaj', 'Nijat', 'Aydin', 'Vugar',
        'Rashad', 'Elvin', 'Kanan', 'Murad', 'Orkhan', 'Ramil', 'Samir', 'Tural',
        'Elnur', 'Farid', 'Anar', 'Javid', 'Emin', 'Rufat', 'Agshin', 'Elman',
        'Etibar', 'Kamran', 'Nariman', 'Vagif', 'Yunus', 'Ziya',
      ],
      last: [
        'Mamedyarov', 'Radjabov', 'Durarbayli', 'Mamedov', 'Safarli', 'Abasov', 'Suleymanli', 'Gashimov',
        'Aliyev', 'Hasanov', 'Huseynov', 'Ibrahimov', 'Mammadov', 'Guliyev', 'Rasulov', 'Salimov',
        'Abbasov', 'Jafarov', 'Kazimov', 'Ahmadov', 'Najafov', 'Mehdiyev', 'Rustamov', 'Hajiyev',
        'Abdullayev', 'Akhundov', 'Nasibov', 'Shikhaliev', 'Veliyev', 'Zeynalov',
      ],
    },

    CZ: {
      first: [
        'David', 'Viktor', 'Thai', 'Štěpán', 'Jan', 'Vlastimil', 'Jiří', 'Pavel',
        'Tomáš', 'Petr', 'Josef', 'Martin', 'Lukáš', 'Ondřej', 'Marek', 'Jakub',
        'Filip', 'Daniel', 'Adam', 'Matěj', 'Vojtěch', 'Michal', 'Dominik', 'Patrik',
        'Radek', 'Roman', 'Zdeněk', 'Radim', 'Vítězslav', 'Miroslav',
      ],
      last: [
        'Navara', 'Láznička', 'Dai', 'Žilka', 'Krejčí', 'Babula', 'Štoček', 'Šimáček',
        'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý',
        'Horák', 'Němec', 'Pokorný', 'Marek', 'Pospíšil', 'Hájek', 'Král', 'Jelínek',
        'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal', 'Zeman',
      ],
    },

    HU: {
      first: [
        'Richárd', 'Péter', 'Csaba', 'Zoltán', 'Benjamin', 'Ferenc', 'Viktor', 'Tamás',
        'Balázs', 'Ádám', 'Gergő', 'László', 'Attila', 'István', 'József', 'Sándor',
        'Gábor', 'János', 'Márk', 'Dániel', 'Bence', 'Levente', 'Barnabás', 'Dominik',
        'Milán', 'Máté', 'Bálint', 'Kristóf', 'Olivér', 'Krisztián',
      ],
      last: [
        'Rapport', 'Lékó', 'Balogh', 'Almási', 'Gledura', 'Berkes', 'Erdős', 'Bánusz',
        'Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss', 'Molnár',
        'Németh', 'Farkas', 'Papp', 'Takács', 'Juhász', 'Mészáros', 'Lakatos', 'Oláh',
        'Simon', 'Fekete', 'Fehér', 'Pap', 'Katona', 'Bogdán',
      ],
    },

    SE: {
      first: [
        'Nils', 'Jonny', 'Tiger', 'Erik', 'Axel', 'Hans', 'Andreas', 'Oscar',
        'Liam', 'William', 'Lucas', 'Oliver', 'Hugo', 'Vincent', 'Alexander', 'Adam',
        'Theo', 'Noah', 'Viggo', 'Charlie', 'Elias', 'Arvid', 'Leo', 'Matteo',
        'Isak', 'Sixten', 'Ludvig', 'Albin', 'Emil', 'Sebastian',
      ],
      last: [
        'Grandelius', 'Hector', 'Hillarp', 'Blomqvist', 'Smith', 'Tikkanen', 'Lindberg', 'Andersson',
        'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson',
        'Gustafsson', 'Pettersson', 'Jonsson', 'Jansson', 'Hansson', 'Bengtsson', 'Jönsson', 'Lindqvist',
        'Jakobsson', 'Magnusson', 'Olofsson', 'Lindström', 'Lindgren', 'Axelsson',
      ],
    },

    DK: {
      first: [
        'William', 'Noah', 'Oscar', 'Lucas', 'Oliver', 'Carl', 'Emil', 'Victor',
        'Frederik', 'Magnus', 'Mads', 'August', 'Malthe', 'Alexander', 'Nikolaj', 'Jonas',
        'Tobias', 'Anton', 'Sebastian', 'Marcus', 'Andreas', 'Kasper', 'Simon', 'Philip',
        'Mathias', 'Rasmus', 'Christian', 'Daniel', 'Martin', 'Morten',
      ],
      last: [
        'Møller', 'Jensen', 'Stubberud', 'Andreasen', 'Jakobsen', 'Berg Hansen', 'Bjerre', 'Høi',
        'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen',
        'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen',
        'Johansen', 'Mortensen', 'Knudsen', 'Schmidt', 'Nissen', 'Lauritsen',
      ],
    },

    IT: {
      first: [
        'Daniele', 'Fabiano', 'Sabino', 'Lorenzo', 'Pier Luigi', 'Axel', 'Luca', 'Sergio',
        'Francesco', 'Alessandro', 'Andrea', 'Matteo', 'Leonardo', 'Gabriele', 'Riccardo', 'Tommaso',
        'Edoardo', 'Giovanni', 'Marco', 'Davide', 'Nicolò', 'Federico', 'Simone', 'Giuseppe',
        'Antonio', 'Vincenzo', 'Roberto', 'Paolo', 'Stefano', 'Enrico',
      ],
      last: [
        'Vocaturo', 'Caruana', 'Brunello', 'Lodici', 'Basso', 'Rombaldoni', 'Moroni', 'Mariotti',
        'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci',
        'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa',
        'Giordano', 'Rizzo', 'Lombardi', 'Barbieri', 'Moretti', 'Ferri',
      ],
    },

    AT: {
      first: [
        'Maximilian', 'Lukas', 'Tobias', 'David', 'Julian', 'Florian', 'Alexander', 'Simon',
        'Felix', 'Jakob', 'Paul', 'Fabian', 'Moritz', 'Daniel', 'Andreas', 'Michael',
        'Markus', 'Stefan', 'Christoph', 'Patrick', 'Benjamin', 'Christian', 'Thomas', 'Philipp',
        'Dominik', 'Manuel', 'Sebastian', 'Elias', 'Valentin', 'Raphael',
      ],
      last: [
        'Gruber', 'Huber', 'Bauer', 'Wagner', 'Müller', 'Pichler', 'Steiner', 'Moser',
        'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Eder', 'Fischer', 'Schmid',
        'Winkler', 'Weber', 'Schwarz', 'Maier', 'Schneider', 'Reiter', 'Schmidt', 'Wimmer',
        'Egger', 'Brunner', 'Lang', 'Baumgartner', 'Auer', 'Binder',
      ],
    },

    CH: {
      first: [
        'Noah', 'Liam', 'Matteo', 'Gabriel', 'Elias', 'Leon', 'Luca', 'David',
        'Louis', 'Samuel', 'Nico', 'Levin', 'Jonas', 'Fabian', 'Simon', 'Jan',
        'Leo', 'Julian', 'Timo', 'Adrian', 'Lars', 'Ruben', 'Vincent', 'Dario',
        'Benjamin', 'Yannick', 'Mathis', 'Silvan', 'Aaron', 'Gian',
      ],
      last: [
        'Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Schneider', 'Huber', 'Meyer',
        'Steiner', 'Fischer', 'Brunner', 'Baumann', 'Frei', 'Gerber', 'Widmer', 'Zimmermann',
        'Moser', 'Wyss', 'Graf', 'Roth', 'Hofmann', 'Bucher', 'Lehmann', 'Kaufmann',
        'Odermatt', 'Stoll', 'Bachmann', 'Sutter', 'Vogel', 'Wenger',
      ],
    },

    BR: {
      first: [
        'Miguel', 'Arthur', 'Gael', 'Heitor', 'Theo', 'Davi', 'Bernardo', 'Gabriel',
        'Pedro', 'Lorenzo', 'Matheus', 'Lucas', 'Benjamin', 'Nicolas', 'Guilherme', 'Rafael',
        'Joaquim', 'Samuel', 'Enzo', 'João', 'Benicio', 'Anthony', 'Bryan', 'Leonardo',
        'Vicente', 'Murilo', 'Daniel', 'Henrique', 'Caio', 'Lucca',
      ],
      last: [
        'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Alves',
        'Rodrigues', 'Costa', 'Gomes', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes',
        'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade',
        'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas',
      ],
    },

    AR: {
      first: [
        'Benjamin', 'Santiago', 'Mateo', 'Tomás', 'Juan', 'Felipe', 'Lautaro', 'Joaquín',
        'Bautista', 'Lorenzo', 'Diego', 'Nicolás', 'Valentino', 'Matías', 'Ignacio', 'Francisco',
        'Lucas', 'Agustín', 'Máximo', 'Bruno', 'Emiliano', 'Gonzalo', 'Facundo', 'Pedro',
        'Manuel', 'Joaquin', 'Julián', 'Ramiro', 'Camilo', 'Lisandro',
      ],
      last: [
        'González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez',
        'García', 'Sánchez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez',
        'Flores', 'Benítez', 'Acosta', 'Medina', 'Suárez', 'Herrera', 'Aguirre', 'Pereyra',
        'Giménez', 'Molina', 'Silva', 'Castro', 'Ortiz', 'Rojas',
      ],
    },

    JP: {
      first: [
        'Haruto', 'Sota', 'Yuto', 'Yuma', 'Hiroto', 'Yusei', 'Aoi', 'Ren',
        'Sora', 'Itsuki', 'Minato', 'Kaito', 'Riku', 'Asahi', 'Ryo', 'Takumi',
        'Yamato', 'Kenta', 'Daiki', 'Kenshin', 'Hiroki', 'Shota', 'Daichi', 'Taiki',
        'Naoki', 'Koki', 'Kengo', 'Masaki', 'Tatsuya', 'Kohei',
      ],
      last: [
        'Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura',
        'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Saito', 'Matsumoto',
        'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Yamazaki', 'Mori', 'Abe', 'Ikeda',
        'Hashimoto', 'Ishikawa', 'Yamashita', 'Ogawa', 'Ishii', 'Hasegawa',
      ],
    },

    KZ: {
      first: [
        'Alikhan', 'Aibek', 'Amir', 'Arman', 'Asset', 'Baurzhan', 'Daulet', 'Dias',
        'Erzhan', 'Galym', 'Ilyas', 'Kanat', 'Kuanysh', 'Maksat', 'Marat', 'Nurbol',
        'Nurlan', 'Olzhas', 'Rustam', 'Samat', 'Serik', 'Talgat', 'Temirlan', 'Timur',
        'Ualikhan', 'Ulan', 'Yerlan', 'Zhanibek', 'Abai', 'Adilet',
      ],
      last: [
        'Akhmetov', 'Abdullayev', 'Omarov', 'Aliyev', 'Ibragimov', 'Karimov', 'Sultanov', 'Turgenev',
        'Nurlanov', 'Erzhanov', 'Tolegenov', 'Seitkazin', 'Baimaganbetov', 'Dauletov', 'Aitbayev', 'Muratov',
        'Kuzembayev', 'Balgabekov', 'Sadykov', 'Khassenov', 'Mussin', 'Zhaksybekov', 'Aubakirov', 'Beisembayev',
        'Tleubergenov', 'Yerzhanov', 'Rysbekov', 'Bekturov', 'Serikov', 'Kassymov',
      ],
    },

    IR: {
      first: [
        'Parham', 'Alireza', 'Ehsan', 'Amin', 'Pouya', 'Bardia', 'Shayan', 'Arash',
        'Kian', 'Amirreza', 'Mohammad', 'Reza', 'Ali', 'Hossein', 'Mahdi', 'Hamid',
        'Saeed', 'Mehdi', 'Farhad', 'Farzad', 'Behzad', 'Kamran', 'Nima', 'Navid',
        'Omid', 'Payam', 'Ramin', 'Sina', 'Arman', 'Kaveh',
      ],
      last: [
        'Maghsoodloo', 'Firouzja', 'Tabatabaei', 'Idani', 'Ghaemmaghami', 'Gholami', 'Alavi', 'Karimi',
        'Moradi', 'Hosseini', 'Ahmadi', 'Ebrahimi', 'Rahimi', 'Rezaei', 'Mousavi', 'Jafari',
        'Sadeghi', 'Taheri', 'Heidari', 'Alizadeh', 'Bagheri', 'Kazemi', 'Hashemi', 'Nazari',
        'Rafiei', 'Asgari', 'Shirazi', 'Tehrani', 'Mohammadi', 'Naseri',
      ],
    },

    IL: {
      first: [
        'Amit', 'Noam', 'Itai', 'Yoav', 'Omer', 'Eitan', 'Daniel', 'Gal',
        'Roi', 'Tomer', 'Shai', 'Asaf', 'Or', 'Raz', 'Nadav', 'Yonatan',
        'Aviv', 'Ben', 'Liam', 'Ariel', 'Uri', 'Amir', 'Yair', 'Elad',
        'Dor', 'Ido', 'Guy', 'Barak', 'Adam', 'Ofir',
      ],
      last: [
        'Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Dahan', 'Avraham', 'Friedman',
        'Moshe', 'Yosef', 'Azoulay', 'Malka', 'Hadad', 'Ben David', 'Ohana', 'Attias',
        'Katz', 'Shapira', 'Weiss', 'Rosenberg', 'Goldberg', 'Klein', 'Segal', 'Rabin',
        'Barak', 'Sharon', 'Netanyahu', 'Kahana', 'Gross', 'Kaplan',
      ],
    },

    TR: {
      first: [
        'Eymen', 'Yusuf', 'Miraç', 'Ömer', 'Ali', 'Emir', 'Kerem', 'Mustafa',
        'Ahmet', 'Mehmet', 'Hasan', 'Hüseyin', 'İbrahim', 'İsmail', 'Murat', 'Osman',
        'Can', 'Kaan', 'Burak', 'Cem', 'Deniz', 'Emre', 'Serkan', 'Tolga',
        'Volkan', 'Berk', 'Onur', 'Ozan', 'Taha', 'Yiğit',
      ],
      last: [
        'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk',
        'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
        'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Korkmaz', 'Özer', 'Tekin',
        'Türkmen', 'Avcı', 'Erdoğan', 'Güneş', 'Aksoy', 'Acar',
      ],
    },

  };

  const FALLBACK = {
    first: [
      'Alex', 'Sam', 'Jordan', 'Robin', 'Chris', 'Pat', 'Lee', 'Kim',
      'Andrea', 'Lou', 'Casey', 'Drew', 'Frankie', 'Glenn', 'Hayden', 'Jamie',
      'Kelly', 'Morgan', 'Nicky', 'Quinn', 'Riley', 'Sage', 'Taylor', 'Val',
    ],
    last: [
      'Walker', 'Carter', 'Foster', 'Hayes', 'Reed', 'Brooks', 'Hill', 'Cole',
      'Ward', 'Fox', 'Bennett', 'Hunter', 'Fisher', 'Gray', 'Price', 'Shaw',
      'Webb', 'Graham', 'Knight', 'Marshall', 'Owen', 'Palmer', 'Rose', 'Watson',
    ],
  };

  return {
    /** @returns {{first: string[], last: string[]}} */
    getPool(countryCode) {
      return POOLS[countryCode] || FALLBACK;
    },

    getFallback() {
      return FALLBACK;
    },

    getCountries() {
      return Object.keys(POOLS);
    },
  };

})();

if (typeof window !== 'undefined' && window.cl) {
  window.cl.names = NamePools;
}
