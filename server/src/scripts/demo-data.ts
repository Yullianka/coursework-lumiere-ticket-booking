import { lockInventory } from '../repositories/booking-repository.js';
import { inTransaction, type DatabasePool } from '../config/database.js';
import { seed } from '../config/migrations.js';

const fixtureId = (kind: number, number: number) =>
  `${kind}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

/** Explicit, fictional fixtures for a local coursework demonstration. Never run at startup. */
export async function seedDemoData(pool: DatabasePool): Promise<void> {
  await seed(pool);
  await inTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(1171101)');
    await lockInventory(db);
    const catalog = [
      [
        'Місто після дощу',
        'FILM',
        110,
        'Атмосферна історія про випадкову зустріч, що змінює життя двох незнайомців.',
      ],
      [
        'Орбіта тиші',
        'FILM',
        125,
        'Науково-фантастична подорож екіпажу дослідницької станції до незвіданого сигналу.',
      ],
      [
        'Літо на Подолі',
        'FILM',
        95,
        'Тепла комедія про друзів, стару кав’ярню та одне незабутнє київське літо.',
      ],
      [
        'Таємниця старого маяка',
        'FILM',
        100,
        'Сімейна пригодницька історія про пошуки загубленого щоденника на узбережжі.',
      ],
      [
        'Листи, яких не надіслали',
        'PLAY',
        90,
        'Камерна вистава про пам’ять, вибір і слова, які ми відкладаємо на потім.',
      ],
      [
        'Останній трамвай',
        'PLAY',
        105,
        'Драматична зустріч пасажирів нічного трамвая, кожен із яких має свою таємницю.',
      ],
      [
        'Репетиція щастя',
        'PLAY',
        80,
        'Легка театральна комедія про акторів, чиї особисті історії виходять на сцену.',
      ],
      [
        'Сад між світами',
        'PLAY',
        115,
        'Поетична вистава з музикою про родину, повернення додому та силу уяви.',
      ],
    ] as const;
    for (let i = 0; i < catalog.length; i++) {
      const [title, type, duration, description] = catalog[i];
      await db.query(
        'INSERT INTO productions(id,title,type,duration_minutes,description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
        [
          fixtureId(3, 101 + i),
          title,
          type,
          duration,
          description + ' Навчальний вигаданий репертуар.',
        ],
      );
    }
    for (let h = 0; h < 2; h++) {
      const hallId = fixtureId(1, 101 + h),
        rows = h === 0 ? 6 : 5,
        columns = h === 0 ? 10 : 8;
      await db.query('INSERT INTO halls(id,name) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING', [
        hallId,
        h === 0 ? 'Демо · Велика сцена' : 'Демо · Камерний зал',
      ]);
      for (let row = 1; row <= rows; row++)
        for (let seat = 1; seat <= columns; seat++) {
          const category = row === rows ? 'BALCONY' : row === rows - 1 ? 'VIP' : 'STANDARD';
          await db.query(
            'INSERT INTO seats(id,hall_id,row_number,seat_number,category) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
            [
              fixtureId(2, 10001 + h * 1000 + (row - 1) * columns + seat - 1),
              hallId,
              row,
              seat,
              category,
            ],
          );
        }
    }
    for (let i = 0; i < 6; i++) {
      await db.query(
        `INSERT INTO users(id,email,password_hash,display_name,student_verified)
        VALUES ($1,$2,'DEMO_ACCOUNT_LOGIN_DISABLED',$3,$4) ON CONFLICT(id) DO NOTHING`,
        [
          fixtureId(6, 101 + i),
          `demo.client.${i + 1}@example.invalid`,
          `Демо-клієнт ${i + 1}`,
          i % 2 === 0,
        ],
      );
    }
    for (const [i, code, percent, active] of [
      [0, 'LUMIERE15', 15, true],
      [1, 'THEATRE20', 20, true],
      [2, 'ARCHIVE10', 10, false],
    ] as const) {
      await db.query(
        `INSERT INTO discounts(id,code,type,percent,valid_from,valid_to,active)
        VALUES ($1,$2,'PROMO',$3,now()-interval '30 days',now()+interval '90 days',$4) ON CONFLICT(id) DO NOTHING`,
        [fixtureId(5, 101 + i), code, percent, active],
      );
    }
    // Six past days and twelve current/upcoming days, two halls per day.
    for (let i = 0; i < 36; i++) {
      const sessionId = fixtureId(4, 101 + i),
        hallId = fixtureId(1, 101 + (i % 2));
      await db.query(
        `INSERT INTO sessions(id,production_id,hall_id,starts_at,ends_at)
        SELECT $1,p.id,$2,t.start_time,t.start_time+p.duration_minutes*interval '1 minute'
        FROM productions p CROSS JOIN LATERAL (SELECT
          (date_trunc('day',now() AT TIME ZONE 'Europe/Kyiv')+$4::int*interval '1 day'+interval '18 hours')
          AT TIME ZONE 'Europe/Kyiv' AS start_time) t WHERE p.id=$3
        ON CONFLICT(id) DO NOTHING`,
        [sessionId, hallId, fixtureId(3, 101 + (i % 8)), Math.floor(i / 2) - 6],
      );
      for (const [category, base] of [
        ['STANDARD', 18000],
        ['VIP', 30000],
        ['BALCONY', 14000],
      ] as const) {
        await db.query(
          'INSERT INTO session_prices(session_id,category,price_kopecks) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [sessionId, category, base + (i % 4) * 2000],
        );
      }
      await db.query(
        `INSERT INTO session_seats(session_id,seat_id,hall_id,category)
        SELECT $1,id,hall_id,category FROM seats WHERE hall_id=$2 ON CONFLICT DO NOTHING`,
        [sessionId, hallId],
      );
      // Distinct historical outcomes make sales and occupancy reports useful immediately.
      if (i >= 24) continue;
      const bookingId = fixtureId(7, 101 + i);
      if ((await db.query('SELECT 1 FROM bookings WHERE id=$1', [bookingId])).rowCount) continue;
      const available = (
        await db.query(
          `SELECT ss.seat_id,ss.status,sp.price_kopecks FROM session_seats ss
        JOIN seats st ON st.id=ss.seat_id JOIN session_prices sp ON sp.session_id=ss.session_id AND sp.category=ss.category
        WHERE ss.session_id=$1 ORDER BY st.row_number,st.seat_number`,
          [sessionId],
        )
      ).rows;
      const count = 2 + (i % 6);
      const chosen = Array.from(
        { length: count },
        (_, j) => available[Math.floor((j * (available.length - 1)) / (count - 1))],
      );
      if (chosen.some((s) => !s || s.status !== 'AVAILABLE')) continue;
      const status = i % 6 === 4 ? 'CANCELLED' : i % 6 === 5 ? 'EXPIRED' : 'PAID';
      const booking = (
        await db.query(
          `INSERT INTO bookings(id,user_id,session_id,status,created_at,expires_at)
        SELECT $1,$2,id,$4,least(now()-interval '2 hours',starts_at-interval '1 day'),
        least(now()-interval '2 hours',starts_at-interval '1 day')+interval '15 minutes'
        FROM sessions WHERE id=$3 RETURNING created_at,expires_at`,
          [bookingId, fixtureId(6, 101 + (i % 6)), sessionId, status],
        )
      ).rows[0];
      const percent = i % 3 === 0 ? 15 : i % 2 === 0 ? 10 : 0;
      for (let j = 0; j < chosen.length; j++) {
        const s = chosen[j],
          itemId = fixtureId(8, 1001 + i * 10 + j);
        const discount = Math.round((s.price_kopecks * percent) / 100);
        await db.query(
          `INSERT INTO booking_items(id,booking_id,session_id,seat_id,base_price_kopecks,discount_kopecks,final_price_kopecks,discount_name,discount_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            itemId,
            bookingId,
            sessionId,
            s.seat_id,
            s.price_kopecks,
            discount,
            s.price_kopecks - discount,
            percent === 15 ? 'PROMO' : percent === 10 ? 'STUDENT' : 'NONE',
            percent === 15 ? fixtureId(5, 101) : null,
          ],
        );
        if (status === 'PAID') {
          await db.query(
            "UPDATE session_seats SET status='SOLD',booking_id=$1 WHERE session_id=$2 AND seat_id=$3",
            [bookingId, sessionId, s.seat_id],
          );
          await db.query(
            "INSERT INTO tickets(id,booking_item_id,sold_at) VALUES ($1,$2,$3::timestamptz+interval '1 minute')",
            [fixtureId(9, 1001 + i * 10 + j), itemId, booking.created_at],
          );
        }
      }
      await db.query(
        `INSERT INTO booking_audit(booking_id,event_type,status,occurred_at)
        VALUES ($1,'BOOKING_CREATED','PENDING',$2),($1,$3,$4,$5)`,
        [
          bookingId,
          booking.created_at,
          `BOOKING_${status}`,
          status,
          status === 'EXPIRED'
            ? booking.expires_at
            : new Date(new Date(booking.created_at).getTime() + 60000),
        ],
      );
    }
  });
}
