<?php

if(isset($_POST["Send"])){

    $conn= mysqli_connect('','','','');

    if($conn){
            $sql = mysqli_query($conn,"SELECT email_id,track from import_contacts");
            //$recipients = array();
            while($row = mysqli_fetch_array($sql)) {
                //$result=mysqli_query($conn,"SELECT email_id,track FROM import_contacts");
                
                // $row=mysqli_fetch_assoc($result);
                printf ("%s\n",$row["track"]);
                $tracking_id=$row['track'];
                $email=$row['email_id'];
                printf ("%s\n",$row["email_id"]);
                


                            if($sql){
                            $to = $email;
                            $subject = "HTML email";
                            


                            $message = "<html><head><title>HTML email</title></head><body><img border='0' src='https://globalkreations.com/major/check.php?id=$tracking_id' width='1' height='1' alt='' ></body></html>".$message1 = file_get_contents("emailtemp.html");

                            
                            echo "testmail";


                            // Always set content-type when sending HTML email
                            $headers = "MIME-Version: 1.0" . "\r\n";
                            $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
                            //$headers .="Content-ID:<gk.png>"
                            // More headers
                            $headers .= 'From: <talktous@globalkreations.com>' . "\r\n";



                            if(mail($to,$subject,$message,$headers)){
                                
                            echo "done";
                        }
                        else{
                            $e=error_get_last();
                            echo $e ;
                            echo "not sent";
                            print_r(error_get_last());

                        }
                    }
                        
            

           }
      }
 }
?>
