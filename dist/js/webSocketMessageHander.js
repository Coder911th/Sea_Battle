'use strict';

void function (seaBattle) {

    seaBattle.printMap = printMap;

    /**** Обработчик сообщений от WebSocket-сервера ****/

    var
    // Константы, определяющие тип ячейки на карте
    UNKNOWN_CELL = 0,
        // Не известно, есть ли там что-либо
    MISS_CELL = 1,
        // В этой ячейке мы промахнулись
    HIT_CELL = 2,
        // В этой ячейке мы попали по вражескому кораблю
    SAVED_CELL = 3,
        // Этот корабль мы не успели подстрелить, противник либо выйграл, либо сдался
    upperAlphabet = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К']; // Вспомогательный алфавит

    var $myFieldData = $('.my.field tr').filter(':gt(0)').find('td').filter(':not(:first-of-type)');

    seaBattle.webSocketMessageHander = function (msg) {
        // Парсим строку с сообщением в объект
        msg = JSON.parse(msg.data);
        console.log(msg); // DEBUG

        switch (msg.type) {
            case 'getting-rooms':
                /**
                 * Сервер сразу после подключения высылает все 
                 * созданные на данный момент комнаты клиенту 
                 **/

                if (msg.rooms.length == 0) {
                    /* Если нет ни одой созданной комнаты
                    Показываем сообщение об этом */
                    $('.no-rooms-message').css('display', 'table-row');
                    return;
                }

                // Добавляем комнаты в таблицу
                msg.rooms.forEach(createTableRow);
                break;
            case 'error':
                /* Произошла ошибка, выводим popup с её текстом */
                $('.popup .message').text(msg.message);
                $('.popup').removeClass('prompt').addClass('alert').css({
                    display: 'flex',
                    opacity: 0
                }).animate({
                    opacity: 1
                }, 500);
                break;
            case 'new-room':
                /* Была создана новая комната */
                $('.no-rooms-message').css('display', '');

                createTableRow(msg.room);
                break;
            case 'room-created':
                /*
                    Комната была успешно создана
                    msg.id       - id комнаты
                    msg.userName - ваш ник
                    msg.roomName - имя комнаты
                */

                // Очищаем чат
                $('.chat .messages').html('');

                // Устанавливаем id текущей комнаты
                seaBattle.currentRoom = msg.id;

                // Сохраняем имя создателя комнаты
                seaBattle.nickName = $('#nickname').val();

                // Скрываем popup
                $('.popup').fadeOut(300).queue(function (next) {
                    $(this).removeClass('prompt').removeClass('alert');
                    next();
                });

                // Скрываем страницу с выбором комнаты
                $('.room-selection-page').fadeOut(300);

                // Показываем страницу с комнатой
                $('.room-page')
                // Устанавливаем админку
                .addClass('admin').delay(300)
                // Анимация перехода между страницами
                .queue(function (next) {
                    $(this).css({
                        display: 'flex',
                        opacity: 0
                    });
                    next();
                }).animate({
                    opacity: 1
                }, 500)
                // Разблокировка кнопки "Начать игру"
                .find('#start-game').prop('disabled', false).end()
                // Настраиваем комнату
                .find('#room-name').text(msg.roomName).end().find('#admin-name').text(msg.userName).end().find('#ai-counter').text('0').end()
                // Добавляем себя в список игроков комнаты
                .find('tbody').html('<tr>\n                                <td class="you">' + msg.userName + '<span class="kick"></span></td>\n                            </tr>');
                break;
            case 'update-room-info':
                /* Обновлена информация о комнатах */

                if (msg.close) {
                    // Закрываем комнату
                    $(seaBattle.rooms[msg.id]).remove(); // Удаляем строку из таблицы
                    delete seaBattle.rooms[msg.id]; // Удаляем информацию о комнате

                    var rows = $('.room-selection-page tr').filter(':gt(0)').length;

                    if (rows == 1) $('.no-rooms-message') // Показываем сообщение об отсутствии комнат
                    .css('display', 'table-row');

                    return;
                }

                // Получаем <td> таблицы с измененной комнатой (DOM-элемент)
                // Первый - имя комнаты, второй - количество AI, третий - количество игроков
                var roomDataElements = $(seaBattle.rooms[msg.id]).children();

                // Обновляем информацию в таблице
                msg.ai != null ? roomDataElements.eq(1).text(msg.ai) : null;
                msg.players != null ? roomDataElements.eq(2).text(msg.players) : null;

                if (seaBattle.currentRoom == msg.id && msg.ai != null) {
                    /* Мы находимся в обновленной комнате и изменилось количество AI */
                    $('#ai-counter').text(msg.ai); // Обновляем информацию
                }

                break;
            case 'joined':
                /* 
                    Вы успешно присоединились к комнате
                    msg.id       - идентификатор комнаты
                    msg.userName - ваш ник
                    msg.roomName - название комнты
                    msg.ai       - количество ботов
                    msg.players  - массив имён реальных игроков
                    msg.admin    - имя создателя комнаты
                */

                // Очищаем чат
                $('.chat .messages').html('');

                // Формируем html-разметку таблицы игроков комнаты
                var tableMarkup = '';
                msg.players.forEach(function (playerName) {
                    return tableMarkup += '<tr>\n                        <td' + (playerName == msg.userName ? ' class="you"' : '') + '>' + playerName + '<span class="kick"></span></td>\n                    </tr>';
                });

                // Устанавливаем id текущей комнаты
                seaBattle.currentRoom = msg.id;

                // Скрываем popup
                $('.popup').fadeOut(300).queue(function (next) {
                    $(this).removeClass('prompt').removeClass('alert');
                    next();
                });

                // Скрываем страницу с выбором комнаты
                $('.room-selection-page').fadeOut(300);

                // Показываем страницу с комнатой
                $('.room-page')
                // Убираем админку, если была
                .removeClass('admin').delay(300)
                // Анимация перехода между страницами
                .queue(function (next) {
                    $(this).css({
                        display: 'flex',
                        opacity: 0
                    });
                    next();
                }).animate({
                    opacity: 1
                }, 500)
                // Блокировка кнопки "Начать игру"
                .find('#start-game').prop('disabled', true).end()
                // Настраиваем комнату
                .find('#room-name').text(msg.roomName).end().find('#admin-name').text(msg.admin).end().find('#ai-counter').text(msg.ai).end()
                // Создаём список игроков комнаты
                .find('tbody').html(tableMarkup);

                // Сохраняем ваш никнейм в пространстве имён
                seaBattle.nickName = msg.userName;

                break;
            case 'new-player':
                /* В комнату вошёл новый игрок с именем msg.userName */
                printToChat('\u0418\u0433\u0440\u043E\u043A "' + msg.userName + '" \u0432\u043E\u0448\u0451\u043B \u0432 \u043A\u043E\u043C\u043D\u0430\u0442\u0443');
                // Добавим новую строку в таблицу
                $('.room-page tbody').append('\n                        <tr>\n                            <td>' + msg.userName + '<span class="kick"></span></td>\n                        </tr>');

                break;
            case 'leave-room':
                /* Игрок с именем msg.name покинул игровую комнату */
                if (msg.kicked) printToChat('\u0418\u0433\u0440\u043E\u043A "' + msg.name + '" \u0431\u044B\u043B \u0432\u044B\u0433\u043D\u0430\u043D \u0438\u0437 \u043A\u043E\u043C\u043D\u0430\u0442\u044B');else printToChat('\u0418\u0433\u0440\u043E\u043A "' + msg.name + '" \u043F\u043E\u043A\u0438\u043D\u0443\u043B \u043A\u043E\u043C\u043D\u0430\u0442\u0443');

                $('.room-page td').each(function () {
                    if ($(this).text() == msg.name) $(this).parent().remove();
                });
                break;
            case 'new-admin':
                /* У комнаты новый админ - msg.name */
                $('#admin-name').text(msg.name);

                printToChat('\u0423 \u043A\u043E\u043C\u043D\u0430\u0442\u044B \u043D\u043E\u0432\u044B\u0439 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 - ' + msg.name);

                if (seaBattle.nickName == msg.name) $('.room-page') // Активируем админку
                .addClass('admin').find('#start-game').prop('disabled', false);

                break;
            case 'chat':
                /* Получено сообщение msg.text от msg.nickName */
                printToChat(msg.text, msg.nickName);
                $('#chat-input').val(''); // Очищаем поле ввода сообщения
                break;
            case 'kick':
                /* Вас выкинули из комнаты */

                // Переход к selecting-room-page
                $('.room-page').animate({
                    opacity: 0
                }, 500).queue(function (next) {
                    $(this).css('display', 'none');
                    next();
                });

                $('.room-selection-page').delay(500).fadeIn(500);

                // Вывод сообщения
                $('.popup').removeClass('prompt').addClass('alert').find('.message').text('Вас выгнали из комнаты! Пожалуйста, больше туда не заходите').end().css({
                    display: 'flex',
                    opacity: 0
                }).animate({
                    opacity: 1
                }, 500);

                break;
            case 'start-game':
                /* 
                    Игра началась
                    msg.enemies  - массив имён противников
                */

                // Удаляем себя из списка врагов :)
                msg.enemies.splice(msg.enemies.indexOf(seaBattle.nickName), 1);
                console.log(msg.enemies);

                // Сохраняем количество противников в NS
                seaBattle.enemies = msg.enemies.length;

                $('#give-up').text('Сдаюсь');
                seaBattle.gameOver = false;

                $('.game-page').removeClass('ready');

                $('.room-page').animate({
                    opacity: 0
                }, 500).queue(function (next) {
                    $(this).css('display', 'none');
                    next();
                });

                $('.game-page').delay(500).queue(function (next) {
                    $(this).css({
                        display: 'flex',
                        opacity: 0
                    });
                    next();
                }).animate({
                    opacity: 1
                }, 500);

                /* Сброс настроек после предыдущей игры */
                /* Очищаем обе карты */
                $('.game-page').find('.field tr').filter(':not(:first-of-type)').find('td').filter(':not(:first-of-type)').removeClass('ship miss attacked');

                /* Сбрасываем остальные настройки и зановим противников в список */
                $('.game-page').addClass('prepare').find('.status').text('Подготовка к сражению').end().find('#one, #two, #three, #four').text('0').end().find('.validation-message').text('Расставьте все свои корабли!').css('display', 'flex').end().find('.history .text').text('').end().find('.history').css('display', 'none').end().end().find('.enemy-list ul').html(msg.enemies.map(function (enemy) {
                    return '<li>' + enemy + '</li>';
                }).join('')).end().find('#ready').prop('disabled', true).removeClass('active').end().find('.info').css('opacity', 1).end().find('.enemy.field table').css('opacity', 0);

                seaBattle.readyState = false;
                break;
            case 'change-ready-state':
                /* Игрок сменил состояние готовности */

                if (msg.name == seaBattle.name) return; // Это ты сам и сменил

                $('.enemy-list li').each(function (index, item) {
                    if ($(item).text() == msg.name) msg.state ? $(item).addClass('ready') : $(item).removeClass('ready');
                });
                break;
            case 'start-battle':
                /* Битва началась! Сейчас ходит msg.move */
                $('.game-page').find('.info').animate({
                    opacity: 0
                }, 500).end().find('table').delay(500).animate({
                    opacity: 1
                }, 500).end().find('.validation-message').hide(500).end().find('.history').delay(500).slideDown(500).end().delay(1000).queue(function (next) {
                    $(this).removeClass('prepare');

                    selectMover(msg);

                    /*
                        Устанавливаем в качестве просматриваемого
                        поля - поле первого в списке игрока
                    */
                    seaBattle.look = $('.enemy-list li').first().addClass('look');

                    /*
                        Создаём пустые поля всех противников
                        и привязываем эти поля к элементам списка противников
                    */
                    var enemies = [],
                        items = $('.enemy-list li');
                    for (var i = 0; i < seaBattle.enemies; i++) {
                        items.eq(i).data('map', [[], [], [], [], [], [], [], [], [], []]);
                    }next();
                });

                break;
            case 'give-up':
                /* Игрок с именем msg.name сдался. Его карта - msg.map */

                if (msg.lost) {
                    // Игрок потерял весь флот

                    if (msg.name == seaBattle.nickName) {
                        $('.popup').find('.message').text('Вы проиграли!').end().removeClass('prompt').addClass('alert').css({
                            display: 'flex',
                            opacity: 0
                        }).animate({
                            opacity: 1
                        }, 500);

                        $('#give-up').text('Выйти');
                        return;
                    }
                }

                // Накидываем этому игроку класс .give-up в списке противников
                searchEnemy(msg.name, function (item) {
                    var myMap = $(item).addClass('give-up').data('map'),
                        realMap = msg.map;

                    if (seaBattle.look.hasClass('give-up')) $('.enemy.field').addClass('block');else $('.enemy.field').removeClass('block');

                    if (msg.lost) printHistory('<span>\u0418\u0433\u0440\u043E\u043A ' + msg.name + ' \u043F\u043E\u0442\u0435\u0440\u044F\u043B \u0441\u0432\u043E\u0439 \u0444\u043B\u043E\u0442!</span><br>');else printHistory('<span>\u0418\u0433\u0440\u043E\u043A ' + msg.name + ' \u0441\u0434\u0430\u043B\u0441\u044F!</span><br>');

                    if (seaBattle.look == null) // Игра ещё не началась
                        return;

                    // Сливаем карты msg.map и myMap
                    for (var _x = 0; _x < 10; _x++) {
                        for (var _y = 0; _y < 10; _y++) {
                            if (realMap[_x][_y] && !myMap[_x][_y]) {

                                if (msg.lost) myMap[_x][_y] = HIT_CELL;else
                                    // Этот кораблик мы не нашли
                                    myMap[_x][_y] = SAVED_CELL;
                            }
                        }
                    }if ($(item).hasClass('look')) // Если мы сейчас просматриваем игрока, который сдался
                        printMap(myMap); // Выводим обновленную карту
                });
                break;
            case 'change-mover':
                /* Сейчас ходит msg.move */
                selectMover(msg);
                break;
            case 'attacked':
                /* 
                    Игрок source атаковал игрока target в точке (x, y)
                    Результат попадания - hit
                    Если корабль был поностью убит, то misses != null
                    misses - точки вокруг убитого корабля
                */

                var x = msg.x,
                    y = msg.y,
                    hit = msg.hit,
                    misses = msg.misses,
                    target = msg.target,
                    source = msg.source;

                if (seaBattle.nickName == target) {
                    // Если атаковали меня
                    $myFieldData.eq(x + y * 10).addClass('attacked');

                    if (misses) misses.forEach(function (miss) {
                        return $myFieldData.eq(miss.x + miss.y * 10).addClass('attacked');
                    });
                } else {
                    // Атаковали противника
                    searchEnemy(msg.target, function (enemy) {
                        var map = $(enemy).data('map');

                        map[x][y] = hit ? HIT_CELL : MISS_CELL;

                        if (misses != null) // Кораблик был убит
                            misses.forEach(function (miss) {
                                return map[miss.x][miss.y] = MISS_CELL;
                            });

                        // Если мы просматривали target, обновить карту противника
                        if ($(enemy).hasClass('look')) seaBattle.printMap(map);
                    });
                }

                printHistory(source + ' <span class="attacks"></span> ' + target + ' ' + ('\u2014 ' + upperAlphabet[x] + (y + 1) + ' ( ' + (hit ? misses != null ? 'Потопил' : 'Попал' : 'Мимо') + ' )<br>'));
                break;
            case 'win':
                /* Вы победили!!! */
                seaBattle.gameOver = true;

                $('.popup').find('.message').text('Поздравляю! Вы победили!!!').end().removeClass('prompt').addClass('alert').css({
                    display: 'flex',
                    opacity: 0
                }).animate({
                    opacity: 1
                }, 500);

                $('#give-up').text('Выйти');
                break;
        }
    };

    /* Функция выделяющая ходящего игрока в списке противников */
    function selectMover(msg) {
        if (msg.move == seaBattle.nickName) {
            $('.status').text('Ваш ход');
            seaBattle.iMove = true;
            $('.game-page').addClass('i-move');
            $('.enemy-list li').removeClass('move');
        } else {
            $('.status').text('\u0421\u0435\u0439\u0447\u0430\u0441 \u0445\u043E\u0434\u0438\u0442 ' + msg.move);

            // Выделяем в списке ходящего игрока
            $('.enemy-list li').each(function (index, item) {
                if ($(item).text() == msg.move) {
                    $(item).addClass('move');
                } else $(item).removeClass('move');
            });

            seaBattle.iMove = false;
            $('.game-page').removeClass('i-move');
        }
    }

    /*
        Пробегается по списку противников и выполняет для каждого элемента
        обратный вызов: callbackSuccess - если это целевой элемент списка,
        иначе callbackFail
     */
    function searchEnemy(name, callbackSuccess) {
        var callbackFail = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

        $('.enemy-list li').each(function (index, item) {
            if ($(item).text() == name) callbackSuccess(item, index);else if (callbackFail) callbackFail(item, index);
        });
    }

    /* Создаёт новую строку для таблицы игровых комнат по данным из room  */
    function createTableRow(room) {
        seaBattle.rooms[room.id] = $('\n            <tr>\n                <td>' + room.name + '</td>\n                <td>' + room.ai + '</td>\n                <td>' + room.players + '</td>\n            </tr>\n        ').data('id', room.id).appendTo('.room-selection-page tbody').get(0);
    }

    /* Экранирование html-символов */
    function escapeHtml(text) {
        return text.replace(/[\"&<>]/g, function (a) {
            return { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[a];
        });
    }

    /* Печатает сообщение в чат комнаты */
    function printToChat(text) {
        var nick = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        var chat = $('.chat .messages');

        if (nick != null) chat.append('<span class="nick">' + escapeHtml(nick) + ': </span>' + escapeHtml(text) + '<br>');else chat.append('<span class="special">' + escapeHtml(text) + '</span><br>');

        // Прокручиваем вниз
        chat[0].scrollTop = chat[0].scrollHeight;
    }

    /* Выводим карту map в .enemy.field */
    function printMap(map) {
        console.log(map);

        $('.enemy.field tr').filter(':gt(0)').find('td').filter(':not(:first-of-type)').each(function (index, td) {
            //console.log(`${index}: x=${Math.floor(index / 10)}, y=${index % 10}`)
            var cell = map[index % 10][Math.floor(index / 10)];
            cell = cell == undefined ? 0 : cell;

            switch (cell) {
                case UNKNOWN_CELL:
                    $(td).removeClass('miss ship saved');break;
                case MISS_CELL:
                    $(td).addClass('miss').removeClass('ship saved');break;
                case HIT_CELL:
                    $(td).addClass('ship').removeClass('miss saved');break;
                case SAVED_CELL:
                    $(td).addClass('ship saved').removeClass('miss');break;
                default:
                    console.log('DEF!');
            }
        });
    }

    function printHistory(text) {
        // Добавляем сообщеение в историю
        var $history = $('.history .text');
        $history.append(text);

        // Прокручиваем историю вниз
        $history[0].scrollTop = $history[0].scrollHeight;
    }
}(seaBattle);