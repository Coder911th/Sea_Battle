void function(seaBattle) {

    /**** Для морского боя ****/

    const 
        COLLISION_MESSAGE = 'Обнаружено столкновение кораблей!<br> ' +
        'Все корабли должны быть прямыми и вокруг каждого корабля должно ' +
        'быть пространство хотя бы в одну ячейку.'

    let 
        ships = [, 0, 0, 0, 0],

        /* Обёртка над мои игровым полем */
        $myField = $('.game-page .my.field'),
        /* Место для отчета об ошибках валидации кораблей */
        $report = $('.validation-message');

    /* Связываем DOM-ячейки поля с данными */
    $myField
        .find('tr')
        .filter(':gt(0)')
        .find('td')
        .each(function(index) {
            let x = index % 11; // x-координата ячейки

            if (x == 0) // Самая первая ячейка в каждом ряду - номер ряда
                return;

            $(this)
                .data({
                    x: x - 1, // Начинаем идексацию не с единицы, а с нуля
                    y: Math.floor(index / 11)
                });
        });

    // Аналогично для поля противника
    $('.enemy.field')
        .find('tr')
        .filter(':gt(0)')
        .find('td')
        .each(function(index) {
            let x = index % 11; // x-координата ячейки

            if (x == 0) // Самая первая ячейка в каждом ряду - номер ряда
                return;

            $(this)
                .data({
                    x: x - 1, // Начинаем идексацию не с единицы, а с нуля
                    y: Math.floor(index / 11)
                });
        });

    // Обработчик установки и удаления уже размещенных кораблей
    function prepareShips() {

        if (seaBattle.readyState) // Зафиксировали изменения, ждём
            return;

        // Кликнули по подписям к строкам и столбцам таблицы
        if ($(this).data('x') == undefined)
            return;

        let 
            $td = $(this),
            x = $td.data('x'),
            y = $td.data('y');
        
        $td.toggleClass('ship');
        seaBattle.ships[x][y] = !seaBattle.ships[x][y];
        checkShipsValid();
    }
    
    $myField
        .on('click', 'td', prepareShips);

    //Процедура проверки корректности расположения корабля
    function checkShipCorrect(x, y, checked) {
        /* 
            Правильным кораблём будет только такой корабль,
            у которого изменяется только одна из координат на всём его протяжении,
            причём нужно двигаться из текущей позиции только вправо или вниз, т.к.
            корабли в остальных направлениях уже проверены
        */

        let [cells, offsetX, offsetY] = [1, 1, 1];

        if (seaBattle.ships[x + 1][y]) {
            // Если справа что-то есть, двигаемся туда
            while (offsetX + x < 10 && seaBattle.ships[x + offsetX][y]) {

                // Проверяем коллизию снизу
                if (
                    checked[x + offsetX][y] || 
                    seaBattle.ships[x + offsetX][y + 1]
                ) {
                    $report.html(COLLISION_MESSAGE);
                    return false;
                }

                checked[x + offsetX][y] = true;
                cells++;
                offsetX++;
            }

        } 
        
        if (seaBattle.ships[x][y + 1]) {
            if (offsetX > 1) {
                $report.html(COLLISION_MESSAGE);
                return false;
            }

            // Снизу что-то есть
            while (offsetY + y < 10 && seaBattle.ships[x][y + offsetY]) {

                // Проверяем коллизию справа
                if (
                    checked[x][y + offsetY] ||
                    seaBattle.ships[x + 1][y + offsetY]
                ) {
                    $report.html(COLLISION_MESSAGE);
                    return false;
                }

                checked[x][y + offsetY] = true;
                cells++;
                offsetY++;
            }
        }

        // Проверка коллизии по двум нижним углам
        if (seaBattle.ships[x - 1][y + offsetY] || seaBattle.ships[x + offsetX][y + offsetY]) {
            $report.html(COLLISION_MESSAGE);
            return false;
        }
        

        if (cells > 4) {
            $report.text(`Обнаружен корабль, создаящий более, чем из 4х палуб!`);
            return false;
        }

        ships[cells]++;
        return true;
    }

    // Проверка валидации расположения кораблей
    function checkShipsValid() {
        // Матрица проверенных ячеек (если true, то проверено)
        let checked = [[], [], [], [], [], [], [], [], [], []];
        checked['-1'] = checked['10'] = seaBattle.ships['-1'] = seaBattle.ships['10'] = [];

        // Обнуляем счётчики кораблей
        ships = [, 0, 0, 0, 0];
            
        // Результат валидации
        let fail = false;

        outerCycle: for (let x = 0; x < 10; x++)
            for (let y = 0; y < 10; y++) {
                if (!checked[x][y] && seaBattle.ships[x][y])
                    if ( !checkShipCorrect(x, y, checked) ) {
                        // Проверка корабля завершилась неудачно
                        fail = true;
                        break outerCycle;
                    }

                checked[x][y] = true;
            }

        if (fail) {
            $report.removeClass('success');
            $('#ready').prop('disabled', true); // Выключаем кнопкку "ГОТОВ"
            return;
        }

        // Выводим информацию о количестве обнаруженных кораблей
        $('#one')
        .text(ships[1]);
        
        $('#two')
            .text(ships[2]);
        
        $('#three')
            .text(ships[3]);
        
        $('#four')
            .text(ships[4]);

        if (ships[1] == 4 && ships[2] == 3 && ships[3] == 2 && ships[4] == 1) {
            $report
                .text('Ваш флот готов!')
                .addClass('success');
            
            $('#ready') // Включаем кнопкку "ГОТОВ"
                .prop('disabled', false);
        } else {
            $report.removeClass('success');
            $('#ready').prop('disabled', true);
            
            if (ships[1] > 4 || ships[2] > 3 || ships[3] > 2 || ships[4] > 1)
                $report.text('Обнаружен лишний корабль!');
            else
                $report.text('Расставьте все свои корабли!');
        }
    }

}(seaBattle);