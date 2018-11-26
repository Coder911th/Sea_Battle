const 
    express      = require('express'),
    app          = express(),
    expressWs    = require('express-ws'),
    http         = require('http');

let
    /* 
        Активные пользователи

        user = {
            socket          - клиентский сокет
            room            - комната, в которой сейчас находится клиент
            game            - игра, в которой сейчас участвует клиент
            name            - имя игрока
            ai              - является ли этот игрок ботом
            ready           - состояние на начало игры (готов ли флот)
            map             - карта флота
            ships           - осталось палуб на поле боя
        };
    */
    users = {},

    /* 
        Игровые комнаты (всё ещё производится набор участников)
        Ключ - уникальные идентификатор комнты.
        
        Структура каждого значения объекта:
        id - ключ текущего объекта в объекте rooms
        admin - ссылка на объект пользователя-создателя комнаты из users
        ai - количество ботов в комнате
        name - название комнаты
        players - массив ссылок на объекты игроков данной комнаты
    */
    rooms = {},

    /* 
        Текущие игры

        game = {
            id          - идентификатор игры
            players     - массив игроков (включая AI)
            move        - индекс в массиве players игрока, который сейчас ходит
            alive       - количество "живых" игроков, учавствующих в игре
        }
    */
    games = {};

/* Состояние ячейки */
const
    EMPTY_CELL   = false, // Ничего нет
    SHIP         = true,  // Есть палуба, даже не горит пока...
    ATTACKED     = 2      // Горящая палуба
    MISSED       = 3;     // Кто-то стрельнул в воду

/* Возвращает ключ, которого ещё нет в объекте object */
function getUniqueKey(object) {
    let uniqueKey = Math.random().toString().slice(2);

    for (let key in object)
        if (key === uniqueKey)
            return getUniqueKey();
    
    return uniqueKey;
}

/* Перебор объекта users */
function forEachUsers(func) {
    for (let key in users)
        func(users[key]);
}

/** 
 * Реализация функции map для объекта rooms
 * Функция func принимает 1 аргумент - объект комнаты
 * Возвращается массив на основе возвращаемых значений func
 **/
function mapRooms(func) {
    let result = [];
    for (let key in rooms) 
        result.push(func(rooms[key]));
    return result;
}

/* Обработчик сообщений от клиента по WebSocket */
function onMessage(message) {
    
    // Преобразуем JSON-строку в объект
    try {
        message = JSON.parse(message);
    } catch(e) {
        return;
    }

    console.log(message); // DEBUG
    
    let 
        // Уникальный идентификатор клиента
        key = this.key,

        // Объект клиента
        user = users[key],
        
        // Переменные, используемые в switch (подробнее о каждой в cases)
        roomName, userName, targetRoom, newRoomId, newRoom, x, y, mover,
        text, target, gameId, AIs, nameIndex, roomId, game, players;

    switch (message.type) {
        case 'create-room':
            /** 
             * Получен запрос на создание комнаты с 
             * названием message.name 
             **/

            roomName = message.roomName.trim();
            userName = message.userName.trim();

            // Проверяем корректность длины имени клиента
            if (userName.length < 3 || userName.length > 12)
                return user.socket.sendJSON({
                    type: 'error',
                    message: 'Чтобы создать игровую комнату нужно ввести ваш nickname, длина ' +
                    'которого должна быть от 3х до 12 символов, не учитывая ведущие ' +
                    'и замыкающие пробельные символы!'
                });

            // Проверяем корректность длины имени комнаты
            if (roomName.length < 3 || roomName.length > 12)
                return user.socket.sendJSON({
                    type: 'error',
                    message: 'Длина имени комнаты должна быть от 3х до 12 символов,' +
                            ' не учитывая ведущие и замыкающие пробельные символы!'
                });

            // Устанавливаем клиенту имя
            user.name = userName;

            // Получаем уникальный номер комнаты
            newRoomId = getUniqueKey(rooms);

            // Создаём комнату
            newRoom = {
                // Идентификатор комнаты
                id: newRoomId,

                // Создатель комнаты (может управлять её настройками)
                admin: user,

                // Ссылки на объекты реальных игроков, находящихся в этой комнате
                players: [user],

                // Количество игрков с искусственным интеллектом
                ai: 0,

                // Название комнаты (от 3 до 12 символов)
                name: roomName
            };

            // Добавляем созданную комнату ко всем остальным
            rooms[newRoomId] = newRoom;

            // Связываем создателя с его комнатой
            user.room = newRoom;

            // Отправляем создателю комнаты сообщение о том, что комната успешно создана
            user.socket.sendJSON({
                type: 'room-created',
                id: newRoomId,
                userName, roomName
            });

            // Рассылаем всем клиентам сообщение о создании новой комнаты
            forEachUsers(user => user.socket.sendJSON({
                type: 'new-room',
                room: {
                    id: newRoomId,          // Идентификатор комнаты
                    players: 1,             // Количество игроков в комнате
                    ai: 0,                  // Количество ИИ в комнате
                    name: roomName          // Название комнаты
                }
            }));
            break;
        case 'join-room':
            /**
             * Получен запрос на присоединение к комнате
             * с идентификационным номером message.id
             * 
             * message.name - имя нового клиента данной комнаты
             **/

            if (user.room != null)
                return; // Пользователь уже находится в комнате TODO: аналогично проверить игру

            if (user.game != null)
                return; // Пользователь в игре

            userName = message.name.trim();

            // Проверяем корректность длины имени клиента
            if (userName.length < 3 || userName.length > 12)
                return user.socket.sendJSON({
                    type: 'error',
                    message: 'Длина имени игрока должна быть от 3х до 12 символов,' +
                            ' не учитывая ведущие и замыкающие пробельные символы!'
                });

            // Целевая комната
            targetRoom = rooms[message.id];

            // Комнаты уже нет
            if (!targetRoom) {
                return user.sendJSON({
                    type: 'error',
                    message: 'Не могу присоединиться к выбранной комнате!'
                });
            }

            // Проверяем уникальность имени клиента внутри комнаты
            if (targetRoom.players.some(player => player.name == userName))
                return user.socket.sendJSON({
                    type: 'error',
                    message: `Игрок с именем ${userName} уже есть в данной комнате!`
                });

            // Устанавливаем клиенту имя
            user.name = userName;

            // Добавляем клиента в комнату
            rooms[message.id].players.push(user);

            // Добавляем клиенту ссылку на его комнату
            user.room = targetRoom;

            // Отправляем всем клиентам обновлённые данные о данной комнате
            forEachUsers(user => user.socket.sendJSON({
                type: 'update-room-info',
                id: message.id,
                players: targetRoom.players.length
            }));

            /** 
             * Отправляем всем участникам комнаты информацию 
             * о имени нового подключенного клиента
             **/
            targetRoom.players.forEach(player => player.socket.sendJSON({
                type: 'new-player',
                userName
            }));

            /* Отправляем пользователю сообщение об успешном подключении */
            user.socket.sendJSON({
                type: 'joined',
                id: targetRoom.id,
                userName: user.name,
                roomName: targetRoom.name,
                ai: targetRoom.ai,
                players: targetRoom.players.map(player => player.name),
                admin: targetRoom.admin.name
            });
            break;
        case 'leave-room':
            // Клиент покидает комнату

            // Целевая комната события
            targetRoom = user.room;

            if (!targetRoom)
                return; // Неоткуда выходить

            // Удаляем клиента из списка игроков данной комнаты
            targetRoom.players.splice(targetRoom.players.indexOf(user), 1);

            // Удаляем связь игрока с комнатой
            user.room = null;

            let leftPlayers = targetRoom.players.length; 

            if (user == targetRoom.admin) {
                // Если из комнаты вышел её создатель
                
                if (leftPlayers > 0) {
                    targetRoom.admin = targetRoom.players[0]; // передаём админку

                    // Оповещаем участников комнаты о новом админе
                    targetRoom.players.forEach(player => player.socket.sendJSON({
                        type: 'new-admin',
                        name: targetRoom.admin.name
                    }));
                }
            }

            // Оповещаем всех участников комнаты о покидании комнаты игроком
            targetRoom.players.forEach(player => player.socket.sendJSON({
                type: 'leave-room',
                name: user.name,
                kicked: false
            }));

            // Оповещаем всех об изменении данных о количестве игроков в данной комнате
            forEachUsers(user => user.socket.sendJSON({
                type: 'update-room-info',
                id: targetRoom.id,
                players: targetRoom.players.length,
                close: leftPlayers == 0 // Нужно ли закрыть комнату
            }));

            if (leftPlayers == 0)
                delete rooms[targetRoom.id]; // Закрываем комнату

            console.log(`Rooms: ${Object.keys(rooms)}`); // DEBUG
            
            break;
        case 'update-ai-info':
            /*
                Создатель комнаты изменил количество AI в комнате
                message.increment == true => +1 ai, else -1 ai
            */
           
            // Проверка ложного запроса (отсутствие привелегий/комнаты)
            if (!user.room || user.room.admin != user)
                return;


            // Изменяем количество AI
            user.room.ai = message.increment
                ? user.room.ai + 1 
                : Math.max(user.room.ai - 1, 0);

            // Отправляем всем клиентам обновлённые данные о данной комнате
            forEachUsers(u => u.socket.sendJSON({
                type: 'update-room-info',
                id: user.room.id,
                ai: user.room.ai
            }));

            break;
        case 'chat':
            /* Кто-то отправил сообщение в чате комнаты */
            text = message.text.trim();
            
            if (text == '' || !user.room)
                return;

            // Отправляем сообщение всем участникам комнаты
            user.room.players.forEach(player => player.socket.sendJSON({
                type: 'chat',
                nickName: user.name,
                text
            }));
            break;
        case 'kick':
            /* Нужно кикнуть игрока msg.target из его комнаты */

            if (!user.room || user.room.admin != user)
                return; // Проверки на левый запрос

            target = user.room.players.find(player => player.name == message.target);

            if (!target || target == user)
                return; // Целевого игрока нет в комнате или это админ комнаты

            // Удаляем клиента из списка игроков его комнаты
            target.room.players.splice(target.room.players.indexOf(target), 1);

            // Удаляем связь игрока с комнатой
            target.room = null;

            // Оповещаем игрока о том, что его кикнули
            target.socket.sendJSON({
                type: 'kick'
            });

            // Оповещаем всех участников комнаты о покидании комнаты игроком
            user.room.players.forEach(player => player.socket.sendJSON({
                type: 'leave-room',
                name: target.name,
                kicked: true
            }));

            // Оповещаем всех об изменении данных о количестве игроков в данной комнате
            forEachUsers(u => u.socket.sendJSON({
                type: 'update-room-info',
                id: user.room.id,
                players: user.room.players.length
            }));

            break;
        case 'start-game':
            /* Получен запрос на запуск игры */

            if (!user.room || user.room.admin != user)
                return; // Левый запрос

            // Если в комнате недостаточно игроков
            if (user.room.players.length + user.room.ai < 2)
                return user.socket.sendJSON({
                    type: 'error',
                    message: 'Чтобы запустить комнату нужно хотя бы 2 игрока (включая AI)'
                });
            
            // Запомнимаем идентификатор комнаты, с которой работаем
            roomId = user.room.id;

            // Отправляем всем пользователям запрос о закрытии комнаты
            forEachUsers(u => u.socket.sendJSON({
                type: 'update-room-info',
                id: roomId,
                close: true
            }));

            // Получаем уникальный идентификатор комнаты
            gameId = getUniqueKey(games);

            // Создаём игровые объекты для ботов
            AIs = [];
            nameIndex = 1;
            for (let ai = 0; ai <user.room.ai; ai++) {
                while (user.room.players.some(player => player.name == `Bot-${nameIndex}`))
                    nameIndex++; // Гарантируем уникальные имена ботов внутри комнаты

                AIs.push({
                    ai: true, // Флаг бота
                    name: `Bot-${nameIndex}`,
                    map: null,
                    ready: false, // Готовность к игре
                    ships: 20 // Осталось палуб
                });

                nameIndex++;
            }
            
            // Создаём игру
            games[gameId] = {
                id: gameId, // Идентификатор игры
                move: null, // Индекс игрока, который сейчас ходит
                players: user.room.players.concat(AIs), // Все игроки: реальные + AI
                alive: user.room.players.length // Количество живых игроков
            };

            // Очищаем игровую информацию игрока
            user.room.players.forEach(player => {
                player.game = games[gameId],   // Устанавливаем игру
                player.ai = false;             // Это не бот
                player.ready = false;          // Состояние готовности к игре
                player.map = null;             // Карта флота
                player.ships = 20;             // Осталось палуб
            });
            
            /* Кадому игроку в комнате отправляем запрос на начало игры */
            user.room.players.forEach(player => {
                
                player.socket.sendJSON({
                    type: 'start-game',
                    enemies: games[gameId].players.map(gamer => gamer.name)
                });

                player.room = null; // Разрываем его связь с комнатой

            });

            // Удаляем комнату
            delete rooms[roomId];

            /* Через 5-6 секунд запускаем генераторы карт для каждого из AI */
            AIs.forEach(ai =>
                setTimeout(generateField, 1000 + 1000 * Math.random(), ai, games[gameId])
            );

            // DEBUG
            console.log(`Rooms: [${Object.keys(rooms).join(', ')}]`);
            console.log(`Games: [${Object.keys(games).join(', ')}]`);
            
            break;
        case 'change-ready-state':
            /* 
                Игрок сменил состояние готовности на message.ready
                Его размещение кораблей в message.map
            */

            if (!user.game || user.game.move != null)
                return;

            if (message.state) {

                let map = Object.assign(message.map, {'-1': []});

                if (!checkShipsValid(map))
                    return; // Как-то была отправлена невалидная карта

                user.map = map;

                logMap(map); // DEBUG                

            } else {
                user.map = null;
            }

            user.ready = message.state;

            /* Отправляем всем учасникам игры состояние игрока */
            user.game.players.forEach(player => {
                if (!player.ai)
                    player.socket.sendJSON({
                        type: 'change-ready-state',
                        name: user.name,
                        state: message.state
                    });
            });
            

            if (user.game.players.every(player => player.ready == true)) {
                // Запускаем игру
                user.game.move = 0;

                user.game.players.forEach(player => {
                    if (!player.ai)
                        player.socket.sendJSON({
                            type: 'start-battle',
                            move: user.game.players[0].name
                        });
                });
            }

            break;
        case 'give-up':

            if (!user.game)
                return;

            game = user.game;
            mover = false;

            /* Если ход был игрока, который сдался */
            if (game.players[game.move] == user)
                mover = true;

            // Удаляем игрока из списка игроков
            game.players.splice(game.players.indexOf(user), 1);

            game.alive--;
            console.log('alive: ' + game.alive);

            if (game.alive == 0 || game.alive == 1 && game.players.length < 2) {

                if (game.alive == 1) {
                    // Остался только победитель!
                    game.players.forEach(player => {
                        if (!player.ai) {
                            player.socket.sendJSON({
                                type: 'win'
                            });

                            player.game = null;
                            player.map = null;
                        }
                    });

                    user.socket.sendJSON({
                        type: 'give-up',
                        name: user.name,
                        map: user.map,
                        lost: message.lost
                    });
                }

                // Закрываем игру
                delete games[game.id];
                console.log('Close game');
                console.log(`Games: [${Object.keys(games).join(', ')}]`);
            } else {
                // Отправляем всем участникам игры сообщение о выбывании игрока
                game.players.concat(user).forEach(player => {
                    if (!player.ai)
                        player.socket.sendJSON({
                            type: 'give-up',
                            name: user.name,
                            map: user.map,
                            lost: message.lost
                        });
                });

                // Ищем нового игрока, который будет ходить
                if (mover) {
                    nextMove(game);
                }
            }

            // Разрываем связь пользователя с игрой
            user.game = null;
            user.map = null; // Сообщаем сборщику мусора, что карта нам уже не нужна
            break;
        case 'attack':
            /* 
                Атака по игроку с именем message.target
                по координатам (message.x, message.y)
            */

            if (!user.game || user.game.players[user.game.move] != user)
                return;

            game    = user.game;
            players = game.players;
            x       = message.x;
            y       = message.y;

            target = players.find(player => player.name == message.target);

            if (!target)
                return; // Такого игрока нет

            if (target.map[x][y] === ATTACKED || target.map[x][y] === MISSED)
                return; // Эта позиция уже была атакована

            if (!attack(game, target, x, y))
                nextMove(game);
            break;
    }

}

/* Обработчик закрытия соединения с клиентом по WebSocket */
function onClose() {
    
    let 
        // Уникальный идентификатор клиента
        key = this.key,

        // Объект клиента
        user = users[key];

    if (user.game) {
        // Пользователь участвует в игре
        
        onMessage.call(this, JSON.stringify({
            type: 'give-up'
        }));
    } else {
        if (user.room) {
            user.socket.offline = true; // Отключаем сокет
            onMessage.call(this, JSON.stringify({ type: 'leave-room' }));
        } 
    }

    // Удаляем пользователя из базы
    delete users[this.key];

    // DEBUG
    console.log(`Close connection: ${this.key}`);
    console.log(`users: [${Object.keys(users).join(', ')}]`);
}

/* Пользовательская функция для отправки JSON-данных по WebSocket */
function sendJSON(object) {
    try {
        if (!this.offline)
            this.send(JSON.stringify(object));
    } catch(e) {
        delete users[this.key];
    }
}

/**** Валидация карты ****/

//Процедура проверки корректности расположения корабля
function checkShipCorrect(x, y, checked, shipsLocation, ships) {
    /* 
        Правильным кораблём будет только такой корабль,
        у которого изменяется только одна из координат на всём его протяжении,
        причём нужно двигаться из текущей позиции только вправо или вниз, т.к.
        корабли в остальных направлениях уже проверены
    */

    let [cells, offsetX, offsetY] = [1, 1, 1];

    if (shipsLocation[x + 1][y]) {
        // Если справа что-то есть, двигаемся туда
        while (offsetX + x < 10 && shipsLocation[x + offsetX][y]) {

            // Проверяем коллизию снизу
            if (checked[x + offsetX][y] || shipsLocation[x + offsetX][y + 1]) 
                return false;

            checked[x + offsetX][y] = true;
            cells++;
            offsetX++;
        }

    } 
    
    if (shipsLocation[x][y + 1]) {
        if (offsetX > 1)
            return false;

        // Снизу что-то есть
        while (offsetY + y < 10 && shipsLocation[x][y + offsetY]) {

            // Проверяем коллизию справа
            if (checked[x][y + offsetY] || shipsLocation[x + 1][y + offsetY])
                return false;

            checked[x][y + offsetY] = true;
            cells++;
            offsetY++;
        }
    }

    // Проверка коллизии по двум нижним углам
    if (shipsLocation[x - 1][y + offsetY] || shipsLocation[x + offsetX][y + offsetY])
        return false;
    

    if (cells > 4)
        return false;

    ships[cells]++;
    return true;
}

// Проверка валидации расположения кораблей
function checkShipsValid(shipsLocation) {
    // Матрица проверенных ячеек (если true, то проверено)
    let checked = [[], [], [], [], [], [], [], [], [], []];
    checked['-1'] = checked['10'] = [];

    // Обнуляем счётчики кораблей
    ships = [, 0, 0, 0, 0],
    
    // Результат валидации
    fail = false;

    outerCycle: for (let x = 0; x < 10; x++)
        for (let y = 0; y < 10; y++) {
            if (!checked[x][y] && shipsLocation[x][y])
                if ( !checkShipCorrect(x, y, checked, shipsLocation, ships) )
                    // Проверка корабля завершилась неудачно
                    return false;

            checked[x][y] = true;
        }

    if (ships[1] == 4 && ships[2] == 3 && ships[3] == 2 && ships[4] == 1)
        return true;
    else
        return false;
}

/**** Генерация карты ****/

// Двигаемся вправо от (x, y)
function checkRight(field, x, y, len) {
    // Двигаемся вправо
    for (let step = 0; step < len; step++)
        if (x + step >= 10 || field[x + step][y])
            return {correct: false};

    return {
        correct: true,
        dx: 1,
        dy: 0
    };
}

// Двигаемся влево от (x, y)
function checkLeft(field, x, y, len) {
    for (let step = 0; step < len; step++)
        if (x - step < 0 || field[x - step][y])
            return {correct: false};

    return {
        correct: true,
        dx: -1,
        dy: 0
    };
}

// Двигаемся вверх от (x, y)
function checkUp(field, x, y, len) {
    for (let step = 0; step < len; step++)
        if (y - step < 0 || field[x][y - step])
            return {correct: false};

    return {
        correct: true,
        dx: 0,
        dy: -1
    };
}

// Двигаемся вниз от (x, y)
function checkDown(field, x, y, len) {
    for (let step = 0; step < len; step++)
        if (y + step >= 10 || field[x][y + step])
            return {correct: false};

    return {
        correct: true,
        dx: 0,
        dy: 1
    };
}

/* Генерация поля боя для AI */
function generateField(ai, game) {
    let 
        // Заготовка поля
        field = [[], [], [], [], [], [], [], [], [], [], []],
        map = [[], [], [], [], [], [], [], [], [], [], []],
        dir, // Направление: 0 - вектикальное, 1 - горизонтальное
        x, y; // Координаты
    
    let ships = [4, 3, 2, 1],
        check = [checkRight, checkLeft, checkUp, checkDown],
        result;

    let start = Date.now();
    ships.forEach(shipLen => {
        
        // Расставляем 5 - shipLen кораблей длины shipLen каждый
        for (let i = 0; i < 5 - shipLen; i++) { 

            do {
                dir = Math.floor(Math.random() * 4);  // 0..3
                x =   Math.floor(Math.random() * 10); // 0..9
                y =   Math.floor(Math.random() * 10); // 0..9

                result = check[dir](field, x, y, shipLen);
            } while (!result.correct);

            // Ставим корабль в позицию (x, y) в направлении dir
            for (let offset = -1; offset <= shipLen; offset++) {
                if (x + result.dx * offset >= 0 && x + result.dx * offset < 10) {
                    if (offset != -1 && offset != shipLen)
                        map[x + result.dx * offset][y + result.dy * offset] = true;
                    field[x + result.dx * offset][y + result.dy * offset] = true;
                }
                
                if (x + result.dx * offset + result.dy >= 0 && x + result.dx * offset + result.dy < 10)
                    field[x + result.dx * offset + result.dy][y + result.dy * offset + result.dx] = true;
                
                if (x + result.dx * offset - result.dy >= 0 && x + result.dx * offset - result.dy < 10)
                    field[x + result.dx * offset - result.dy][y + result.dy * offset - result.dx] = true;
            }
            
        }
    });

    let end = Date.now();
    
    console.log(`Карта была сгенерирована за ${end - start} ms\n${ai.name}`);
    
    logMap(map);

    // Устанавливаем карту и готовность для AI
    ai.map = map;
    ai.ready = true;

    /* Отправляем всем учасникам игры состояние AI */
    game.players.forEach(player => {
        if (!player.ai)
            player.socket.sendJSON({
                type: 'change-ready-state',
                name: ai.name,
                state: true
            });
    });
}

/* DUBUG-функция для вывода сгенерированной карты */
function logMap(map) {
    for (let i = 0; i < 10; i++) {
        let line = '';
        for (let j = 0; j < 10; j++)
            line += `${map[i][j] == true ? '#' : ' '} `;
        console.log(line);
    }
}

/* 
    Проверяет не был ли убит весь корабль 
    на карте map, начиная с точки (x, y)
*/
function isShipDie(map, x, y, misses, visited = [[], [], [], [], [], [], [], [], [], []]) {
    if (x < 0 || x >= 10 || y < 0 || y >= 10)
        return true; // Вышли за карту

    if (visited[x][y])
        return true;
    visited[x][y] = true

    if (map[x][y] === SHIP)
        return false; // Встретили неподбитую палубу

    if (!map[x][y] || map[x][y] === MISSED) { // Добрались до пустой ячейки
        misses.push({x, y});
        return true;
    }

    return isShipDie(map, x - 1, y, misses, visited) && isShipDie(map, x + 1, y, misses, visited) 
        && isShipDie(map, x, y - 1, misses, visited) && isShipDie(map, x, y + 1, misses, visited)
        && isShipDie(map, x - 1, y - 1, misses, visited) && isShipDie(map, x + 1, y - 1, misses, visited)
        && isShipDie(map, x - 1, y + 1, misses, visited) && isShipDie(map, x + 1, y + 1, misses, visited);
}

/* Атаковать игрока target в точке (x, y) игры game */
function attack(game, target, x, y) {

    let position = target.map[x][y], // атакованная позиция
        hit = false,
        isKill = null,
        misses = []; // Массив промахов на случий потопления корабля

    if (position === SHIP) {
        hit = true;

        // Отнимаем от счётчика игрока одну палубу
        target.ships--;

        if (!target.ships) {
            // Если весь флот уже уничтожен
            if (target.ai) {
                let players = game.players;
                players.splice(players.indexOf(target), 1); // Достаём AI из списка игроков
                
                players.forEach(player => {
                    if (!player.ai)
                        player.socket.sendJSON({
                            type: 'give-up',
                            name: target.name,
                            map: target.map,
                            lost: true
                        });
                });

                if (game.alive == 0 || game.alive == 1 && game.players.length < 2) {

                    if (game.alive == 1) {

                        game.players.forEach(player => {
                            if (!player.ai) {
                                player.socket.sendJSON({
                                    type: 'win'
                                });
    
                                player.game = null;
                                player.map = null;
                            }
                        });
                    }

                    // Закрываем игру
                    delete games[game.id];
                    console.log('Close game');
                    console.log(`Games: [${Object.keys(games).join(', ')}]`);
                }
            } else {
                console.log('Отправляю запрос: ' + target.name + ' проиграл')
                onMessage.call(target.socket, JSON.stringify({
                    type: 'give-up',
                    lost: true // Не осталось кораблей
                }));
            }

            return true;
        }

        // Помечаем уже атакованную клеточку
        target.map[x][y] = ATTACKED;
        // Проверим не потопил ли кораблик
        isKill = isShipDie(target.map, x, y, misses);

    } else { target.map[x][y] = MISSED }

    if (isKill) // Добавляем промахи после потопленного корабля
        misses.forEach(miss => target.map[miss.x][miss.y] = MISSED);

    game.players.forEach(player => {
        if (!player.ai)
            player.socket.sendJSON({
                type: 'attacked',
                x, y,
                source: game.players[game.move].name,
                target: target.name,
                hit: position,
                misses: isKill ? misses : null
            });
    });

    return position;
}

/* Передача хода в игре game */
function nextMove(game) {
    let players = game.players;

    game.move = (game.move + 1) % players.length;

    game.players.forEach(player => {
        if (!player.ai)
            player.socket.sendJSON({
                type: 'change-mover',
                move: players[game.move].name
            });
    });

    // Если ходит AI
    if (players[game.move].ai) {
        while (AImoves(game));
        nextMove(game);
    }
}

/* Логика хода AI в игре game */
function AImoves(game) {
    let players = game.players,  // Массив всех игроков
        AI = players[game.move], // Сам ходящий AI
        target, x, y;

    do {
        target = players[Math.floor(players.length * Math.random())];
    } while (target == AI); // Пока случайно выбирает себя в качестве цели

    do {
        x = Math.floor(10 * Math.random());
        y = Math.floor(10 * Math.random());
    } while (target.map[x][y] === ATTACKED || target.map[x][y] === MISSED); // Пока выбранная позиция уже была атакована

    return attack(game, target, x, y); // Атакуем
}

let server = http.createServer(app);
server.on('error', function() {
    console.log('Если ниже вы видите что-то вроде: EADDRINUSE :::3011 ' +
        'То это значит, что порт 3011 уже занят каким-то другим процессом! ' +
        'Откройте этот порт или запустите тот вариант, который я вам скидывал ранее с 80м портом. ' +
        'P.S. Если и тот не запустится, соберитесь и отпройте же наконец этот 80й порт!');
});
expressWs(app, server);

app
    .ws('/connect', (ws, req) => {
        /* Определяем пользователькую функцию отправки JSON-данных */
        ws.sendJSON = sendJSON;

        // Получаем уникальный ключ для клиента
        key = getUniqueKey(users);

        // Создаём объект пользователя
        user = {
            socket: ws,  // Клиентский сокет
            room: null,  // Комната, в которой сейчас находится клиент
            game: null,  // Игра, в которой сейчас участвует клиент
            name: null   // Имя игрока
        };

        // Сохраняем клиента в базе клиентов
        users[key] = user;

        // Связываем сокет с уникальным ключом клиента
        ws.key = key;

        // DEBUG
        console.log(`New user: ${key}`);
        console.log(`users: [${Object.keys(users).join(', ')}]`);

        // Навешиваем обработчики на сокет
        ws.on('message', onMessage);
        ws.on('close', onClose);

        // Оправляем новому клиенту данные о всех созданных комнатах
        user.socket.sendJSON({
            type: 'getting-rooms',
            rooms: mapRooms(room => ({
                id: room.id,                    // Идентификатор комнаты
                name: room.name,                // Название комнаты
                players: room.players.length,   // Количество игроков в комнате
                ai: room.ai                     // Количество "роботов" в комнате
            }))
        });
    })
    .use('/', express.static('dist'));

server.listen(3011, function() {
    console.log('Откройте в браузере http://localhost:3011/');
});