const express = require('express');
const bodyParser = require('body-parser'); // 추가
const cors = require('cors');
const mysql = require('mysql2');
const app = express();
const session = require('express-session');
const port = 3001;

app.use(express.static(__dirname + '/', {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use(cors());
app.use(bodyParser.json());


// MySQL 연결 설정
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'Kiosk',
});

//데이터베이스 연결
connection.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
    return;
  }
  console.log('Connected to the database');
});

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));
//여기까지 기본설정

// 카테고리별 메뉴 범위 계산 함수
const calculateMenuRange = (category) => {
  let start, end;
  if (category === '1') { // 커피
    start = 100;
    end = 199;
  } else if (category === '2') { // 음료수
    start = 200;
    end = 299;
  } else if (category === '3') { // 티
    start = 300;
    end = 399;
  } else if (category === '4') { // 플랫치노
    start = 400;
    end = 499;
  } else if (category === '5') { // 쉐이크 & 에이드
    start = 500;
    end = 599;
  } else if (category === '6') { // 디저트
    start = 600;
    end = 699;
  } else {
    start = 0;
    end = 0;
  }
  return { start, end };
};

// 데이터베이스에서 해당 범위의 메뉴 정보 조회
const getMenuDataByRange = (category, callback) => {
  const menuRange = calculateMenuRange(category);
  const sql = `SELECT menu_num, menu_name, price, menu_explan, picture AS image_path 
      FROM tb_menu 
      inner join img on tb_menu.menu_num = img.img_num
      WHERE menu_num BETWEEN ? AND ?`;
  connection.query(sql, [menuRange.start, menuRange.end], (err, results) => {
    if (err) {
      console.error('Error fetching menu data:', err);
      callback([]);
      return;
    }
    callback(results);
  });
};

app.get('/menu', (req, res) => {
  const category = req.query.category; // URL 파라미터 읽기
  //const menuRange = calculateMenuRange(category); // 카테고리별 메뉴 범위 계산
  getMenuDataByRange(category, (menuData) => {
    res.json(menuData);
  });
});

// 메뉴 상세 정보 조회 엔드포인트
app.get('/menu/:menuId', (req, res) => {
  const menuId = req.params.menuId;
  console.log(menuId);

  const getMenuQuery = `
    SELECT menu_name, price, menu_explan
    FROM tb_menu
    WHERE menu_num = ?`;

  const getImagePathQuery = `
    SELECT picture
    FROM img
    WHERE img_num = ?`;

  const getAllegyQuery = `
    SELECT allegy_name
    FROM tb_allegy
    INNER JOIN tb_menu_allegy ON tb_allegy.allegy_num = tb_menu_allegy.allegy_num
    WHERE tb_menu_allegy.menu_num = ?`;

  const getOptionQuery = `
    SELECT op_name, op_price
    FROM tb_op
    INNER JOIN tb_menu_op ON tb_op.op_num = tb_menu_op.op_num
    WHERE tb_menu_op.menu_num = ?`;

  connection.query(getMenuQuery, [menuId], (err, menuResults) => {
    if (err) {
      console.error('메뉴 데이터 조회 오류:', err);
      return;
    }

    connection.query(getImagePathQuery, [menuId], (err, imageResults) => {
      if (err) {
        console.error('이미지 데이터 조회 오류:', err);
        return;
      }

      const imagePath = imageResults[0] ? imageResults[0].picture : null;
      if (!imagePath) {
        console.error('이미지 경로를 찾을 수 없습니다.');
        return;
      }

      connection.query(getAllegyQuery, [menuId], (err, allegyResults) => {
        if (err) {
          console.error('알레르기 데이터 조회 오류:', err);
          return;
        }

        const allegyNames = [...new Set(allegyResults.map(result => result.allegy_name))];

        connection.query(getOptionQuery, [menuId], (err, optionResults) => {
          if (err) {
            console.error('옵션 데이터 조회 오류:', err);
            return;
          }

          const optionData = optionResults.map(result => ({
            op_name: result.op_name,
            op_price: result.op_price
          }));

          console.log('메뉴 데이터:', menuResults[0]);

          const menuData = {
            menuData: menuResults[0],
            allegy_names: allegyNames,
            image_path: imagePath,
            op_data: optionData
          };

          res.json(menuData);
        });
      });
    });
  });
});

//08.20 checklist에서 보는 detail내용과 변경사항 db에 저장
app.get('/order/:orderNum', (req, res) => {
  const orderNum = req.params.orderNum;

  const getOrderQuery = `
    SELECT o.*, m.menu_name, m.price AS menu_price, m.menu_explan, i.picture
    FROM tb_order o
    INNER JOIN tb_menu m ON o.menu_num = m.menu_num
    INNER JOIN img i ON o.menu_num = i.img_num
    WHERE o.order_num = ?`;

  const getOrderAllergyQuery = `
    SELECT a.allegy_name
    FROM tb_allegy a
    INNER JOIN tb_menu_allegy ma ON a.allegy_num = ma.allegy_num
    WHERE ma.menu_num = ?`;

  const getOptionQuery = `
    SELECT op.op_name, op.op_price
    FROM tb_op op
    WHERE op.op_num IN (?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(getOrderQuery, [orderNum], (err, orderResults) => {
    if (err) {
      console.error('Error fetching order data:', err);
      res.status(500).json({ error: 'Error fetching order data' });
      return;
    }

    if (orderResults.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const orderData = orderResults[0];

    const opNumbers = [orderData.op1, orderData.op2, orderData.op3, orderData.op4,
    orderData.op5, orderData.op6, orderData.op7, orderData.op8];

    connection.query(getOrderAllergyQuery, [orderData.menu_num], (err, allergyResults) => {
      if (err) {
        console.error('Error fetching order allergy data:', err);
        res.status(500).json({ error: 'Error fetching order allergy data' });
        return;
      }

      connection.query(getOptionQuery, opNumbers, (err, optionResults) => {
        if (err) {
          console.error('Error fetching option data:', err);
          res.status(500).json({ error: 'Error fetching option data' });
          return;
        }

        const allergyNames = [...new Set(allergyResults.map(result => result.allegy_name))];
        orderData.allergy_names = allergyNames;
        orderData.option_data = optionResults;

        res.json(orderData);
      });
    });
  });
});

//detail_menu에서의 변경 내용은 db에 저장
app.post("/addOrder", (req, res) => {
  const {
    menu_num, count, op_t, op_s, op1, op2, op3, op4, op5, op6, op7, op8, } = req.body;

  // INSERT 문 작성 및 실행
  const insertOrderQuery = `
    INSERT INTO tb_order (menu_num, count, op_t, op_s, op1, op2, op3, op4, op5, op6, op7, op8)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    insertOrderQuery,
    [
      menu_num, count, op_t, op_s, op1, op2, op3, op4, op5, op6, op7, op8,],
    (err, result) => {
      if (err) {
        console.error("Error inserting order data:", err);
        res.status(500).json({ error: "Error inserting order data" });
        return;
      } else {
        console.log('데이터 추가 성공:', result);
        //res.status(200).send('데이터 추가 성공');
      }

      // 성공적으로 추가되었다는 응답 전송
      res.json({ success: true });
    }
  );
});
//detail_menu.js끝

//detail_menu_o에서의 변경 내용 db에 저장
app.post("/updateOrder", (req, res) => {
  const { orderNum, newData } = req.body;

  // SQL 쿼리 작성
  const sql = `
    UPDATE tb_order
    SET count = ?, op_t = ?, op_s = ?, op1 = ?, op2 = ?, op3 = ?, op4 = ?, op5 = ?, op6 = ?, op7 = ?, op8 = ?
    WHERE order_num = ?;
  `;

  const values = [
    newData.count,
    newData.op_t,
    newData.op_s,
    newData.op1,
    newData.op2,
    newData.op3,
    newData.op4,
    newData.op5,
    newData.op6,
    newData.op7,
    newData.op8,
    orderNum
  ];

  // SQL 쿼리 실행
  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error updating order:", error);
      res.json({ success: false, message: "주문 정보 업데이트 중 오류가 발생했습니다." });
    } else {
      console.log("Order updated successfully:", results);
      res.json({ success: true, message: "주문 정보가 업데이트되었습니다." });
    }
  });
});
//08.20 추가 끝

// DELETE 요청을 처리하는 API 엔드포인트
app.delete('/deleteOrder/:orderNum', (req, res) => {
  const orderNum = req.params.orderNum;

  const deleteQuery = 'DELETE FROM tb_order WHERE order_num = ?';

  connection.query(deleteQuery, [orderNum], (err, result) => {
    if (err) {
      console.error('Error deleting order:', err);
      res.status(500).json({ error: 'Error deleting order' });
    } else {
      console.log('Order deleted successfully');
      res.json({ message: 'Order deleted successfully' });
    }
  });
});


// 클라이언트에 주문 데이터 제공하는 API 엔드포인트
app.get('/getOrderData', (req, res) => {
  // getOrderData 함수를 이용하여 데이터를 가져와서 클라이언트로 전송
  getOrderData((orderData) => {
    res.json(orderData);
  });
});

// getOrderData 함수 내에서 사용할 데이터 가져오는 코드 추가
const getOrderData = (callback) => {
  const sql1 = `
  SELECT tb_order.*, tb_menu.menu_name, tb_menu.price
  FROM tb_order
  JOIN tb_menu ON tb_order.menu_num = tb_menu.menu_num
  `;

  const sql2 = `
  SELECT img.picture, tb_order.count, tb_menu.price
  FROM img
  INNER JOIN tb_order ON img.img_num = tb_order.menu_num
  INNER JOIN tb_menu ON tb_order.menu_num = tb_menu.Menu_Num
  `;

  //08.20 옵션에 표기된 내용 추가
  const getOptionQuery = `
  SELECT op.op_name, op.op_price
  FROM tb_op op
  WHERE op.op_num IN (?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(sql1, (err, results1) => {
    if (err) {
      console.error('Error fetching order data:', err);
      callback([]);
      return;
    }

    connection.query(sql2, (err, results2) => {
      if (err) {
        console.error('Error fetching image data:', err);
        callback([]);
        return;
      }

      const combinedResults = results1.map((order, index) => ({
        ...order,
        imagePath: results2[index].picture,
      }));

      const orderPromises = combinedResults.map(order => new Promise((resolve, reject) => {
        const opNumbers = [order.op1, order.op2, order.op3, order.op4,
        order.op5, order.op6, order.op7, order.op8];
        connection.query(getOptionQuery, opNumbers, (err, optionResults) => {
          if (err) {
            reject(err);
            return;
          }
          const processedOrder = {
            ...order,
            options: optionResults,
          };
          resolve(processedOrder);
        });
      }));

      Promise.all(orderPromises)
        .then(processedResults => {
          const finalResults = processedResults.map(order => {
            // 주문의 가격과 수량을 곱한 기본 total_price 계산
            let total_price = order.price * order.count;
            // 옵션들의 op_price를 더하여 total_price에 추가
            order.options.forEach(option => {
              total_price += option.op_price;
            });
            return {
              ...order,
              total_price,
            };
          });

          callback(finalResults);
        })
        .catch(error => {
          console.error('Error fetching option data:', error);
          callback([]);
        });
    });
  });
};

//기본 설정
app.get('/detail_menu.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(__dirname + '/detail_menu.js');
});

//은영이
app.get('/search', (req, res) => {
  const keyword = req.query.keyword;

  const sql = `select * from img inner join tb_menu
  on img.img_num = tb_menu.Menu_Num
  where tb_menu.Menu_Name LIKE '%${keyword}%'`;

  connection.query(sql, (err, results) => {
      if (err) {
          console.error('Error executing the query:', err);
          res.status(500).json({ error: 'Internal server error' });
      } else {
          res.json(results);
      }

      //res.setHeader('Content-Type', 'application/javascript');
      // res.sendFile(__dirname + '/search/search.js');
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});