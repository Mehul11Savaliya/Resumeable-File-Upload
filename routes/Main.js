var express = require('express');
var router = express.Router();
const Busboy = require('busboy');
const path = require("path");
const fs = require("fs");
const uuid = require("uuid");

var Datastore = require('nedb')
var db = new Datastore({ filename: './filequeue.db', autoload: true });

router.get('/', function (req, res, next) {
    res.status(200).send("✔");
});

router.post("/", async (req, res) => {
    try {
        let { lastModified, name, size, type } = req.body;
        let ext = name.split(".").pop();
        let ps = `/uploads/${uuid.v4()}.${ext}`;
        fs.openSync(path.join(__dirname, ".." + ps), 'w');
        const insertPromise = new Promise((resolve, reject) => {
            db.insert({ idx: Date.now(), name : name, path: ps, total: size }, (err, indoc) => {
                if (err) {
                    console.log("err", err);
                    reject(err);
                }
                resolve(indoc);
            });
        });

        let resx = await insertPromise;
        return sendRes(res, resx, 201);
    } catch (error) {
        console.log(error.message);
        res.status(400).json({
            errmsg: "invalid request"
        });
    }
})

router.patch("/:id", (req, res) => {
    try {
        let { id } = req.params;
        id = Number.parseInt(id);
        if (isNaN(id)) {
            throw new Error(`invaild resumable file id ${id}`);
        }
        const busboy = Busboy({ headers: req.headers });
        db.findOne({ idx: id }, (err, doc) => {
            if (!doc || err) {
                return res.status(404).send();
            }
            let pathx = doc.path;
            let writestream = fs.createWriteStream(path.join(__dirname, ".." + pathx), { flags: 'a'});

            busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
                file.on("end", () => {
                    db.remove({ idx: doc.idx }, {}, (err, n) => {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("deleted : ", n)
                        }
                    });
                    res.status(200).json(doc);
                });
                file.on("data", (chk) => {
                    // console.log(chk.length);
                })
                file.on("error", (e) => { console.log("err", e) })
                file.pipe(writestream);
            });
            req.pipe(busboy);
        })
    } catch (error) {
        console.error(error.message);
        res.status(400).json({
            errmsg: "invalid request"
        });
    }
});

router.head("/:id", (req, res) => {
    try {
        let { id } = req.params;
        id = Number.parseInt(id)
        if (isNaN(id)) {
            throw new Error(`invaild resumable file id ${id}`);
        }
        // let res  = await fs.stat(path.join(__dirname,"))
        db.findOne({ idx: id }, (err, doc) => {
            if (!doc || err) {
                console.log(doc, err)
                return res.status(404).send();
            }
            fs.stat(path.join(__dirname, ".." + doc.path), (err, stat) => {
              console.log(stat.size);
                let curre = stat.size;
                res.setHeader("id", doc.idx);
                res.setHeader("current", curre);
                res.setHeader("total", doc.total);
                return res.status(200).send();
            });
        })
    } catch (error) {
        console.log(error.message);
        res.status(400).json({
            errmsg: "invalid request"
        });
    }
});

router.delete("/:id", (req, res) => {
    try {
        let { id } = req.params;
        id = Number.parseInt(id)
        if (isNaN(id)) {
            throw new Error(`invaild file id ${id}`);
        }
        db.findOne({ idx: id }, (err, doc) => {
            if (!doc || err) {
                return res.status(404).send();
            }
            let pathx = doc.path;
            try {
                db.remove({ idx: id }, (err, num) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).send("🐦");
                    } else {
                        fs.unlink(path.join(__dirname, ".." + pathx), (err) => {
                            if (err) {
                                console.log(err);
                                return res.status(500).send("🐦");
                            }
                            else {
                                console.log(`count:${num}  deleted `, pathx);
                                return res.status(204).send();
                            }
                        })
                    }
                })

            } catch (error) {
                console.log(err);
                return res.status(500).send("🐦");
            }
        })
    } catch (error) {
        console.log(error.message);
        res.status(400).json({
            errmsg: "invalid request"
        });
    }
});

function sendRes(res, messagejson, status) {
    return res.status(status).json(messagejson);
}

module.exports = router;