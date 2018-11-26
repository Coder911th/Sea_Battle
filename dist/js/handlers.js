'use strict';

/**** Установка обработчиков ****/

void function (seaBattle) {

    var
    // WebSocket
    socket = null;

    // Обработчик кнопки "Подобрать игровую комнату"
    $('#start-selecting-room-button').one('click', function () {
        // Переходим к странице с выбором комнаты
        $('.welcome-page').fadeOut(500);
        $('.room-selection-page').delay(500).fadeIn(500);

        // Подключаемся к WebSocket-серверу
        socket = new WebSocket('ws://' + location.host + '/connect');
        // Подключаем обработку сообщений (файл webSocketMessageHander.js)
        socket.onmessage = seaBattle.webSocketMessageHander;
        // Пользовательская функция для отправки JSON-объектов по WebSocket
        socket.sendJSON = function (object) {
            this.send(JSON.stringify(object));
        };

        // DEBUG
        socket.onclose = socket.onerror = console.log;

        window.socket = socket; // DEBUG
    });

    // Обрабатываем выбор игровой комнаты в таблице
    $('.room-selection-page table').on('click', 'td:not([colspan])', function () {
        // Отправляем запрос на присоединение
        socket.sendJSON({
            type: 'join-room',
            id: $(this).parent().data('id'),
            name: $('#nickname').val()
        });
    });

    // Обработчик кнопки "Создать комнату"
    $('#create-room').click(function () {
        // Показываем popup с просьбой ввести название комнаты
        $('.popup').removeClass('alert').addClass('prompt').css({
            display: 'flex',
            opacity: 0
        }).animate({
            opacity: 1
        }, 500);

        $('#popup-textbox').focus();
    });

    // Обрабатываем клавишу Enter для поля ввода в popup
    $('#popup-textbox').keypress(function (e) {
        return e.key === "Enter" ? $('#popup-button').click() : undefined;
    });

    // Обработчик закрытия popup
    $('.popup .cancel').click(function () {
        $('.popup').animate({
            opacity: 0
        }, 500).queue(function (next) {
            $(this).css('display', 'none').removeClass('prompt').removeClass('alert');
            next();
        });
    });

    // Кнопка "Создать" в popup
    $('#popup-button').click(function () {
        return socket.sendJSON({
            type: 'create-room',
            userName: $('#nickname').val(),
            roomName: $('#popup-textbox').val()
        });
    });

    /* Стрелка, уменьшающая на единицу количество AI в комнате */
    $('.room-page .arrow.left').click(function () {
        // Получаем текущее количество AI
        var ai = $(this).next().text();

        if (ai == '0') // Если убавлять уже некуда, ничего не делаем
            return;

        // Отправляем запрос на изменение числа AI
        socket.sendJSON({
            type: 'update-ai-info',
            increment: false
        });
    });

    /* Стрелка, увеличивающая на единицу количество AI в комнате */
    $('.room-page .arrow.right').click(function () {
        // Получаем текущее количество AI
        var ai = $(this).prev().text();

        // Отправляем запрос на изменение числа AI
        socket.sendJSON({
            type: 'update-ai-info',
            increment: true
        });
    });

    /* Кнопка, которая приводит к выходу из комнаты */
    $('#exit-from-room').click(function () {
        socket.sendJSON({ type: 'leave-room' });

        // Переход к selecting-room-page
        $('.room-page').animate({
            opacity: 0
        }, 500).queue(function (next) {
            $(this).css('display', 'none');
            next();
        });

        $('.room-selection-page').delay(500).fadeIn(500);
    });

    /* Кнопка отправки сообщения в чат комнаты */
    $('#send-message').click(function () {
        var text = $(this).prev().val().trim();

        if (text == '') // Были введены одни пробельные символы
            return;

        socket.sendJSON({
            type: 'chat',
            text: text
        });
    });

    // Привязываем клавишу Enter поля ввода сообщения чата к кнопке "Отправить"
    $('#chat-input').keypress(function (e) {
        return e.key === "Enter" ? $('#send-message').click() : undefined;
    });

    /* Обработка кнопок кика игроков из комнаты */
    $('.room-page tbody').on('click', '.kick', function () {
        socket.sendJSON({
            type: 'kick',
            target: $(this).parent().text()
        });
    });

    /* Кнопка запуска игры в комнате */
    $('#start-game').click(function () {
        // Запрос на запуск игры
        socket.sendJSON({
            type: 'start-game'
        });
    });

    /* Кнопка смены состояния в игре */
    $('#ready').click(function () {
        $(this).toggleClass('active');

        socket.sendJSON({
            type: 'change-ready-state',
            state: seaBattle.readyState = !seaBattle.readyState,
            map: seaBattle.readyState ? seaBattle.ships : null
        });

        $('.game-page').toggleClass('ready');
    });

    // Обработчик атаки по противнику
    $('.enemy.field').on('click', 'td', function () {
        // Если не мой ход, то ничего не делаем
        if (!seaBattle.iMove) return;

        // Кликнули по подписям к строкам и столбцам таблицы
        if ($(this).data('x') == undefined) return;

        // Уже стреляли по этой ячейке
        if ($(this).hasClass('ship') || $(this).hasClass('miss')) return;

        if ($(this).closest('.field').hasClass('block')) return; // Ходить по выбранному игроку нельзя

        socket.sendJSON({
            type: 'attack',
            target: $('.enemy-list .look').text(),
            x: $(this).data('x'),
            y: $(this).data('y')
        });
    });

    // Обработчик выбора просматриваемого противника
    $('.enemy-list').on('click', 'li', function () {
        if (seaBattle.look == null) // Игра ещё не началась
            return;

        var map = $(this).data('map');

        /*
            Выделяем выбранного игрока в списке и 
            снимаем выделение с предыдущего 
        */
        seaBattle.look.removeClass('look');
        $(this).addClass('look');
        seaBattle.look = $(this);

        if (seaBattle.look.hasClass('give-up')) $('.enemy.field').addClass('block');else $('.enemy.field').removeClass('block');

        seaBattle.printMap(map); // Выводим карту противника
    });

    // Кнопочка "Сдаюсь"
    $('#give-up').click(function () {
        if (seaBattle.gameOver || confirm('Вы действительно хотите сдаться?')) {
            socket.sendJSON({
                type: 'give-up'
            });

            // Переходим к окну выбора комнаты
            $('.game-page').animate({
                opacity: 0
            }, 500).queue(function (next) {
                $(this).css({ display: 'none' });
                next();
            });

            $('.room-selection-page').delay(500).fadeIn(500);

            // RESET
            seaBattle.currentRoom = null;
            seaBattle.readyState = false;
            seaBattle.look = null;
            seaBattle.iMove = false;
            seaBattle.gameOver = false;
            seaBattle.ships = [[], [], [], [], [], [], [], [], [], []];
        }
    });
}(seaBattle);