// L'attesa di `waitFor` / `findBy…`: 5 secondi invece di 1.
//
// 04/10/2026: il gate del push si è fermato tre volte di fila, ogni volta su
// un test diverso (pannelloAdminNonInventa, ilMesePagine…), che da solo
// passava sempre. Con 465 file in parallelo su 4 core (carico 11) la pagina
// a volte disegna dopo il secondo che `waitFor` aspetta di default, e il test
// guarda troppo presto. Un controllo che è rosso a caso smette di proteggere:
// la seconda volta lo si salta. Un'attesa più lunga non rallenta i test che
// passano (`waitFor` esce appena la condizione è vera): allunga solo il
// tempo che un test rotto ci mette a dirlo.
import { configure } from '@testing-library/dom'

configure({ asyncUtilTimeout: 5000 })
