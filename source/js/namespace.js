/* Пространство имён данного приложения */
window.seaBattle = {
    nickName: '',       // Имя игрока
    currentRoom: null,  // Идентификатор текущей (выбранной) комнаты
    readyState: false,  // Готовность игрока к началу игры
    rooms: {},          /* 
                            Отображение room.id в строку 
                            таблицы(<tr>) на странице 
                            с выбором комнаты 
                        */
    look: null,         /* 
                            jQuery обёртка над элементом списка
                            противников, который сейчас 
                            просматривается 
                        */
    iMove: false,       // Мой ли ход в игре
    gameOver: false,    // Флаг окончания игры
    ships: [[], [], [], [], [], [], [], [], [], []] // Карта вашего флота
};


/* DEBUG: автозаполнение карты */
function fill() {
    $('.my.field tr:gt(0)')
        .find('td:not(:first-of-type)')
        .eq(0)
        .click()
        .end()
        .eq(1)
        .click()
        .end()
        .eq(2)
        .click()
        .end()
        .eq(3)
        .click()
        .end()
        .eq(5)
        .click()
        .end()
        .eq(6)
        .click()
        .end()
        .eq(7)
        .click()
        .end()
        .eq(33)
        .click()
        .end()
        .eq(32)
        .click()
        .end()
        .eq(34)
        .click()
        .end()
        .eq(36)
        .click()
        .end()
        .eq(70)
        .click()
        .end()
        .eq(38)
        .click()
        .end()
        .eq(51)
        .click()
        .end()
        .eq(52)
        .click()
        .end()
        .eq(54)
        .click()
        .end()
        .eq(55)
        .click()
        .end()
        .eq(57)
        .click()
        .end()
        .eq(58)
        .click()
        .end()
        .eq(94)
        .click()
        .end();
}